require('dotenv').config();
const { Pool } = require('pg');

async function sync() {
  const renderUrl = process.env.RENDER_DATABASE_URL || process.env.DATABASE_URL;
  const localUrl = process.env.LOCAL_DATABASE_URL || "postgresql://postgres:postgres@localhost:5432/crm";
  if (!renderUrl) {
    throw new Error("Set RENDER_DATABASE_URL or DATABASE_URL in .env before running sync.");
  }

  console.log("Connecting to Render and Local PostgreSQL databases...");
  const renderPool = new Pool({ connectionString: renderUrl, ssl: { rejectUnauthorized: false } });
  const localPool = new Pool({ connectionString: localUrl, ssl: false });

  const rClient = await renderPool.connect();
  const lClient = await localPool.connect();

  try {
    const tables = ['users', 'batches', 'contacts', 'appointments', 'callbacks', 'leads', 'reports'];
    for (const table of tables) {
      console.log(`\nSyncing table: ${table}...`);
      const rData = await rClient.query(`SELECT * FROM "${table}"`);
      console.log(`  Fetched ${rData.rows.length} rows from Render DB.`);
      
      if (rData.rows.length === 0) continue;

      // Truncate local table cascade
      await lClient.query(`TRUNCATE TABLE "${table}" CASCADE`);

      const columns = Object.keys(rData.rows[0]);
      const colNames = columns.map(c => `"${c}"`).join(', ');

      for (let i = 0; i < rData.rows.length; i += 200) {
        const batch = rData.rows.slice(i, i + 200);
        const valuePlaceholders = [];
        const values = [];

        batch.forEach((row, rowIdx) => {
          const rowPlaceholders = [];
          columns.forEach((col, colIdx) => {
            const paramIdx = rowIdx * columns.length + colIdx + 1;
            rowPlaceholders.push(`$${paramIdx}`);
            let val = row[col];
            // Format object/json
            if (val !== null && typeof val === 'object' && !(val instanceof Date)) {
              val = JSON.stringify(val);
            }
            values.push(val);
          });
          valuePlaceholders.push(`(${rowPlaceholders.join(', ')})`);
        });

        const insertQuery = `INSERT INTO "${table}" (${colNames}) VALUES ${valuePlaceholders.join(', ')} ON CONFLICT DO NOTHING`;
        await lClient.query(insertQuery, values);
      }
      console.log(`  Synced ${rData.rows.length} rows into Local DB.`);
    }
    console.log("\n✅ All tables synchronized from Render to Local PostgreSQL successfully!");
  } catch (err) {
    console.error("❌ Sync error:", err.message);
  } finally {
    rClient.release();
    lClient.release();
    await renderPool.end();
    await localPool.end();
  }
}

sync();
