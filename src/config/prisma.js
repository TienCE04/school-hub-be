import { PrismaClient } from '../../generated/prisma/index.js';

const prisma = new PrismaClient({
  datasourceUrl: process.env.DATABASE_URL, 
});

export default prisma;