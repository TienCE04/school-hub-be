import app from "./app.js";
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import express from 'express';
import prisma from './config/prisma.js';

import { initSocket } from './realtime/gateway/index.js';

const PORT = process.env.PORT || 3000;

async function startServer() {
  try {
    await prisma.$connect();
    console.log(" Connected to database");

    const server = app.listen(PORT, "0.0.0.0", () => {
      console.log(` Server running on port ${PORT}`);
    });

    // Initialize socket
    initSocket(server);

  } catch (err) {
    console.error(" Database connection failed:", err);
    process.exit(1);
  }
}

startServer();
// triggered restart
