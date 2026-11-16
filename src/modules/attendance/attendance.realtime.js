import prisma from "../../config/prisma.js";
import { getIO } from "../../realtime/gateway/index.js";
import { SOCKET_EVENTS } from "../../realtime/events/index.js";
import { createSocketPayload } from "../../realtime/events/payload.js";

// Connected phones can refresh their schedule immediately; no reminder is sent.
export function invalidateReminderSchedule(classId, teacherId) {
  try {
    const event = "attendance_schedule_changed";
    getIO().to(`class:${classId}`).to(`user:${teacherId}`)
      .emit(event, createSocketPayload("attendance_schedule", event, {}));
  } catch (error) {
    console.error("Could not emit attendance schedule change:", error.message);
  }
}

// Send an invalidation only after the caller's transaction has committed.
export const notifyAttendanceRecordsChanged = async ({ sessionId, recordId, attemptId }) => {
  try {
    const select = { id: true, classId: true, teacherId: true };
    let session;
    if (sessionId) {
      session = await prisma.attendanceSession.findUnique({ where: { id: Number(sessionId) }, select });
    } else if (recordId) {
      const record = await prisma.attendanceRecord.findUnique({
        where: { id: Number(recordId) }, select: { session: { select } },
      });
      session = record?.session;
    } else if (attemptId) {
      const attempt = await prisma.attendanceAttempt.findUnique({
        where: { id: Number(attemptId) }, select: { record: { select: { session: { select } } } },
      });
      session = attempt?.record?.session;
    }
    if (!session) return;
    const event = SOCKET_EVENTS.ATTENDANCE_RECORDS_CHANGED;
    getIO().to(`user:${session.teacherId}`).emit(event, createSocketPayload("attendance", event, {
      sessionId: session.id, classId: session.classId,
    }));
  } catch (error) {
    // Realtime delivery must never turn a committed attendance update into an API failure.
    console.error("Could not emit attendance update:", error.message);
  }
};
