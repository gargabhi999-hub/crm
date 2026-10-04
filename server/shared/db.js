require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const { Pool } = require('pg');
const { PrismaPg } = require('@prisma/adapter-pg');

const adapter = new PrismaPg(process.env.DATABASE_URL, { socketTimeout: 60000 });
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
