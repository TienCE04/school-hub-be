import app from "./app.js";
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import express from 'express';
import prisma from './config/prisma.js';

const PORT = process.env.PORT || 3000;

async function startServer() {
  try {
    await prisma.$connect();
    console.log(" Connected to database");

    app.listen(PORT, () => {
      console.log(` Server running on port ${PORT}`);
    });

  } catch (err) {
    console.error(" Database connection failed:", err);
    process.exit(1);
  }
}

startServer();