import app from "./app.js";
import "dotenv/config";
import express from 'express';
import prisma from './config/prisma.js';

import { initSocket } from './realtime/gateway/index.js';
import { initFirebase } from './config/firebase.js';
import { finalizeExpiredAttendanceSessions, startDueAttendanceSessions } from './modules/attendance/attendance.service.js';
import {
  purgeExpiredAttendanceFaceEvidence,
  purgeExpiredFaceProfiles,
} from './modules/attendance/attendance.checkin.service.js';

const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || "0.0.0.0";

async function startServer() {
  try {
    await prisma.$connect();
    console.log(" Connected to database");

    const server = app.listen(PORT, HOST, () => {
      console.log(` Server listening at http://${HOST}:${PORT}`);
    });

    // Initialize socket
    initSocket(server);

    // Initialize Firebase Admin
    initFirebase();

    let startingScheduledSessions = false;
    const startScheduledSessions = async () => {
      if (startingScheduledSessions) return;
      startingScheduledSessions = true;
      try {
        await startDueAttendanceSessions();
      } catch (error) {
        console.error("Scheduled attendance start failed:", error);
      } finally {
        startingScheduledSessions = false;
      }
    };
    startScheduledSessions();
    const attendanceStartTimer = setInterval(startScheduledSessions, 5_000);
    attendanceStartTimer.unref();

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
