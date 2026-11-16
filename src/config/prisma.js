import pg from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import pkg from '@prisma/client';
const { PrismaClient } = pkg;
import 'dotenv/config';

const { Pool } = pg;
const connectionString = process.env.DATABASE_URL;
const pool = new Pool({
  connectionString,
  max: Number(process.env.DATABASE_POOL_MAX || 10),
  idleTimeoutMillis: Number(process.env.DATABASE_POOL_IDLE_TIMEOUT_MS || 10_000),
});
const adapter = new PrismaPg(pool);

const prisma = new PrismaClient({ adapter });

export default prisma;
export { pool };
