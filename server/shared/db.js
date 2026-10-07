require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const { Pool } = require('pg');
const { PrismaPg } = require('@prisma/adapter-pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 15000,
  keepAlive: true,
  ssl: (!process.env.DATABASE_URL || process.env.DATABASE_URL.includes('localhost') || process.env.DATABASE_URL.includes('127.0.0.1'))
    ? false
    : { rejectUnauthorized: false }
});

pool.on('error', (err) => {
  console.warn('⚠️ Idle PostgreSQL pool client error (handled):', err.message);
});

const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function connect() {
  try {
    await prisma.$connect();
    console.log("✅ Connected to PostgreSQL Database via Prisma");
    return prisma;
  } catch (err) {
    console.error("❌ Prisma Connection Error:", err.message);
    throw err;
  }
}

function getDB() {
  return prisma;
}

module.exports = {
  connect,
  prisma,
  getDB
};
