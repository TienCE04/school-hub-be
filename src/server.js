import app from "./app.js";
import "dotenv/config";
import express from 'express';
import prisma from './config/prisma.js';

import { initSocket } from './realtime/gateway/index.js';
import { initFirebase } from './config/firebase.js';

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

    // Initialize Firebase Admin
    initFirebase();

  } catch (err) {
    console.error(" Database connection failed:", err);
    process.exit(1);
  }
}

startServer();
// triggered restart
