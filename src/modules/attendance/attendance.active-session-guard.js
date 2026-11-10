import { conflict } from "./attendance.service.shared.js";

// Serialize session creation/start requests that share a class or teacher.
export const lockAttendanceSessionScope = async (tx, classId, teacherId) => {
  await tx.$queryRaw`SELECT "id" FROM "Class" WHERE "id" = ${classId} FOR UPDATE`;
  await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${teacherId} FOR UPDATE`;
};

export const assertNoActiveAttendanceSession = async (tx, {
  classId,
  teacherId,
  excludeSessionId,
  now = new Date(),
}) => {
  const activeSession = await tx.attendanceSession.findFirst({
    where: {
      status: "ACTIVE",
      expiresAt: { gt: now },
      ...(excludeSessionId ? { id: { not: excludeSessionId } } : {}),
      OR: [{ classId }, { teacherId }],
    },
    select: { id: true },
  });

  if (activeSession) {
    throw conflict("ACTIVE_SESSION_EXISTS", "Đang có phiên hoạt động");
  }
};
