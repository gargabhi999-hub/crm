const { Pool } = require('pg');

function parseDateFromRemarks(remarks) {
  if (!remarks) return null;
  // Match first [Appointment by ... on M/D/YYYY, H:MM AM/PM] or [Call Back by ... on M/D/YYYY, H:MM AM/PM]
  const match = remarks.match(/\[(?:Appointment|Call Back) by [^\]]+ on (\d{1,2}\/\d{1,2}\/\d{4},\s*\d{1,2}:\d{2}(?::\d{2})?\s*(?:AM|PM)?)\]/i);
  if (match) {
    const d = new Date(match[1]);
    if (!isNaN(d.getTime())) return d;
  }
  return null;
}

async function repairDatabase(url, label) {
  console.log(`\n==================================================`);
  console.log(`Starting Data Repair for ${label}...`);
  console.log(`==================================================`);
  
  const pool = new Pool({
    connectionString: url,
    ssl: url.includes('render.com') ? { rejectUnauthorized: false } : false
  });

  const client = await pool.connect();

  try {
    // -----------------------------------------------------------------
    // 1. REPAIR APPOINTMENTS
    // -----------------------------------------------------------------
    console.log('\n--- Checking Appointments with date 2026-12-01 ---');
    const apptsRes = await client.query(`
      SELECT a._id as appt_id, a.contact_id, a.fields->>'Name' as name, a.appointment_dt, a.remarks as appt_remarks,
             c.remarks as contact_remarks, c.disposed_at, c.created_at, c.disposition as contact_disp
      FROM appointments a
      LEFT JOIN contacts c ON a.contact_id = c._id
      WHERE a.appointment_dt >= '2026-12-01' AND a.appointment_dt < '2026-12-02'
      ORDER BY a.appointment_dt ASC
    `);

    console.log(`Found ${apptsRes.rows.length} appointments on Dec 1 in appointments table.`);

    for (const row of apptsRes.rows) {
      const name = row.name || 'Unknown';
      const combinedRemarks = `${row.appt_remarks || ''} ${row.contact_remarks || ''}`;

      // Check if legitimate (e.g. Arun said "Next month")
      if (name.toLowerCase() === 'arun' || combinedRemarks.toLowerCase().includes('next month')) {
        console.log(`  [KEEP] ${name} -> Legitimate next month appointment (${row.appointment_dt.toISOString()})`);
        continue;
      }

      // Try to parse original appointment date from remarks
      let targetDate = parseDateFromRemarks(row.contact_remarks) || parseDateFromRemarks(row.appt_remarks);

      // Fallback to disposed_at if remarks date not parsed
      if (!targetDate && row.disposed_at) {
        targetDate = new Date(row.disposed_at);
      }

      if (targetDate) {
        console.log(`  [UPDATING] ${name} (${row.appt_id})`);
        console.log(`    From: ${row.appointment_dt.toISOString()}`);
        console.log(`    To:   ${targetDate.toISOString()}`);

        // Update appointments table
        await client.query(`
          UPDATE appointments
          SET appointment_dt = $1, last_modified = NOW()
          WHERE _id = $2
        `, [targetDate, row.appt_id]);

        // Update contacts table
        if (row.contact_id) {
          await client.query(`
            UPDATE contacts
            SET appointment_dt = $1, last_modified = NOW()
            WHERE _id = $2
          `, [targetDate, row.contact_id]);
        }
      } else {
        console.log(`  [WARNING] Could not determine date for ${name}`);
      }
    }

    // Also check contacts table directly for contacts marked Appointment with 2026-12-01
    const contactApptsRes = await client.query(`
      SELECT _id, fields->>'Name' as name, appointment_dt, remarks, disposed_at, disposition
      FROM contacts
      WHERE appointment_dt >= '2026-12-01' AND appointment_dt < '2026-12-02'
    `);
    for (const c of contactApptsRes.rows) {
      const name = c.name || 'Unknown';
      if (name.toLowerCase() === 'arun' || (c.remarks && c.remarks.toLowerCase().includes('next month'))) {
        continue;
      }
      if (c.disposition !== 'Appointment') {
        // If contact is Not Interested, DND, etc. clear the bogus appointment_dt
        console.log(`  [CLEARING NON-APPT] ${name} (disp: ${c.disposition}) appointment_dt -> NULL`);
        await client.query(`
          UPDATE contacts
          SET appointment_dt = NULL, last_modified = NOW()
          WHERE _id = $1
        `, [c._id]);
      } else {
        let targetDate = parseDateFromRemarks(c.remarks) || (c.disposed_at ? new Date(c.disposed_at) : null);
        if (targetDate) {
          console.log(`  [UPDATING CONTACT] ${name} appointment_dt -> ${targetDate.toISOString()}`);
          await client.query(`
            UPDATE contacts
            SET appointment_dt = $1, last_modified = NOW()
            WHERE _id = $2
          `, [targetDate, c._id]);
        }
      }
    }

    // -----------------------------------------------------------------
    // 2. REPAIR CALLBACKS
    // -----------------------------------------------------------------
    console.log('\n--- Checking Callbacks with date >= 2027-01-01 ---');
    const cbsRes = await client.query(`
      SELECT cb._id as cb_id, cb.contact_id, cb.fields->>'Name' as name, cb.call_back_dt, cb.remarks as cb_remarks,
             c.remarks as contact_remarks, c.disposed_at, c.created_at, c.disposition as contact_disp
      FROM callbacks cb
      LEFT JOIN contacts c ON cb.contact_id = c._id
      WHERE cb.call_back_dt >= '2027-01-01'
      ORDER BY cb.call_back_dt ASC
    `);

    console.log(`Found ${cbsRes.rows.length} callbacks with date >= 2027.`);

    for (const row of cbsRes.rows) {
      const name = row.name || 'Unknown';
      const combinedRemarks = `${row.cb_remarks || ''} ${row.contact_remarks || ''}`.toLowerCase();

      // Check if legitimate 2027 callback
      if (
        name.toLowerCase() === 'vivek' ||
        combinedRemarks.includes('in march') ||
        combinedRemarks.includes('january') ||
        combinedRemarks.includes('april') ||
        combinedRemarks.includes('3 month later') ||
        combinedRemarks.includes('next year')
      ) {
        console.log(`  [KEEP] ${name} -> Legitimate future callback (${row.call_back_dt.toISOString()})`);
        continue;
      }

      // Parse original callback date
      let targetDate = parseDateFromRemarks(row.contact_remarks) || parseDateFromRemarks(row.cb_remarks);
      if (!targetDate && row.disposed_at) {
        targetDate = new Date(row.disposed_at);
      }

      if (targetDate) {
        console.log(`  [UPDATING CB] ${name} (${row.cb_id})`);
        console.log(`    From: ${row.call_back_dt.toISOString()}`);
        console.log(`    To:   ${targetDate.toISOString()}`);

        await client.query(`
          UPDATE callbacks
          SET call_back_dt = $1, last_modified = NOW()
          WHERE _id = $2
        `, [targetDate, row.cb_id]);

        if (row.contact_id) {
          await client.query(`
            UPDATE contacts
            SET call_back_dt = $1, last_modified = NOW()
            WHERE _id = $2
          `, [targetDate, row.contact_id]);
        }
      } else {
        console.log(`  [WARNING CB] Could not determine date for ${name}`);
      }
    }

    // Also check contacts table directly for callbacks with >= 2027
    const contactCbsRes = await client.query(`
      SELECT _id, fields->>'Name' as name, call_back_dt, remarks, disposed_at, disposition
      FROM contacts
      WHERE call_back_dt >= '2027-01-01'
    `);
    for (const c of contactCbsRes.rows) {
      const name = c.name || 'Unknown';
      const rem = (c.remarks || '').toLowerCase();
      if (
        name.toLowerCase() === 'vivek' ||
        rem.includes('in march') ||
        rem.includes('january') ||
        rem.includes('april') ||
        rem.includes('3 month later') ||
        rem.includes('next year')
      ) {
        continue;
      }
      if (c.disposition !== 'CallBack') {
        console.log(`  [CLEARING NON-CB] ${name} (disp: ${c.disposition}) call_back_dt -> NULL`);
        await client.query(`
          UPDATE contacts
          SET call_back_dt = NULL, last_modified = NOW()
          WHERE _id = $1
        `, [c._id]);
      } else {
        let targetDate = parseDateFromRemarks(c.remarks) || (c.disposed_at ? new Date(c.disposed_at) : null);
        if (targetDate) {
          console.log(`  [UPDATING CONTACT CB] ${name} call_back_dt -> ${targetDate.toISOString()}`);
          await client.query(`
            UPDATE contacts
            SET call_back_dt = $1, last_modified = NOW()
            WHERE _id = $2
          `, [targetDate, c._id]);
        }
      }
    }

    console.log(`\n✅ Database repair completed successfully for ${label}!`);

  } catch (err) {
    console.error(`❌ Error repairing ${label}:`, err);
  } finally {
    client.release();
    await pool.end();
  }
}

async function main() {
  const localUrl = 'postgresql://postgres:postgres@localhost:5432/crm';
  const renderUrl = 'postgresql://crm_mroc_user:VH09W1Hs1DNU74tTGc9RHA7puAUXXtlr@dpg-d880i5pkh4rs73c7vdlg-a.oregon-postgres.render.com/CRM?sslmode=require';

  await repairDatabase(localUrl, 'LOCAL DATABASE');
  await repairDatabase(renderUrl, 'RENDER PRODUCTION DATABASE');
}

main();
