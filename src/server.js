import app from "./app.js";
import "dotenv/config";
import express from 'express';
import prisma from './config/prisma.js';

import { initSocket } from './realtime/gateway/index.js';
import { initFirebase } from './config/firebase.js';
import { finalizeExpiredAttendanceSessions } from './modules/attendance/attendance.service.js';
import {
  purgeExpiredAttendanceFaceEvidence,
  purgeExpiredFaceProfiles,
} from './modules/attendance/attendance.checkin.service.js';

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

    const finalizeExpiredSessions = () => {
      finalizeExpiredAttendanceSessions().catch((error) => {
        console.error("Attendance expiry finalization failed:", error);
      });
    };
    finalizeExpiredSessions();
    const attendanceExpiryTimer = setInterval(finalizeExpiredSessions, 30_000);
    attendanceExpiryTimer.unref();

    const purgeExpiredFaceSamples = () => {
      purgeExpiredFaceProfiles().catch((error) => {
        console.error("Expired face profile cleanup failed:", error);
      });
      purgeExpiredAttendanceFaceEvidence().catch((error) => {
        console.error("Expired attendance face evidence cleanup failed:", error);
      });
    };
    purgeExpiredFaceSamples();
    const faceRetentionTimer = setInterval(purgeExpiredFaceSamples, 60 * 60 * 1000);
    faceRetentionTimer.unref();

  } catch (err) {
    console.error(" Database connection failed:", err);
    process.exit(1);
  }
}

startServer();
// triggered restart
