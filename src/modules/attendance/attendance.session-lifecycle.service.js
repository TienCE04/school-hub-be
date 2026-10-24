import prisma from "../../config/prisma.js";
import { hashToken } from "../../shared/utils/hash.js";
import {
  addAuditLog, assertSessionManager, BLE_TOKEN_ROTATE_SECONDS, conflict, createBleToken,
  getBleTokenExpiry, notFound, parseRequiredId, toIso,
} from "./attendance.service.shared.js";

const issueBleToken = async (tx, session, now) => {
  const token = createBleToken();
  const tokenHash = hashToken(token);
  const expiresAt = getBleTokenExpiry(now, session.expiresAt);

  await tx.attendanceSessionConfig.upsert({
    where: { sessionId: session.id },
    create: {
      sessionId: session.id,
      allowOfflineAttempt: false,
      bleTokenHash: tokenHash,
      bleTokenExpiresAt: expiresAt,
      bleStartedAt: now,
      bleStoppedAt: null,
    },
    update: {
      bleTokenHash: tokenHash,
      bleTokenExpiresAt: expiresAt,
      bleStartedAt: now,
      bleStoppedAt: null,
    },
  });

  await tx.attendanceSessionChallenge.create({
    data: {
      sessionId: session.id,
      type: "BLE_TOKEN",
      challengeHash: tokenHash,
      tokenFingerprint: tokenHash,
      issuedAt: now,
      expiresAt,
      singleUse: false,
    },
  });

  return { token, expiresAt };
};

export const startTeacherSession = async (user, rawSessionId) => {
  const sessionId = parseRequiredId(rawSessionId, "sessionId");
  const now = new Date();

  const result = await prisma.$transaction(async (tx) => {
    const session = await tx.attendanceSession.findUnique({
      where: { id: sessionId },
      include: { config: true, device: true },
    });
    if (!session) throw notFound("Không tìm thấy phiên điểm danh");
    await assertSessionManager(tx, user, session);
    if (!["DRAFT", "SCHEDULED"].includes(session.status)) {
      throw conflict("SESSION_NOT_STARTABLE", "Phiên điểm danh không ở trạng thái có thể bắt đầu");
    }
    if (session.startsAt > now) {
      throw conflict("SESSION_STARTS_LATER", "Chưa đến thời gian bắt đầu phiên điểm danh");
    }
    if (session.expiresAt <= now) {
      throw conflict("SESSION_EXPIRED", "Thời gian của phiên điểm danh đã kết thúc");
    }
    if (!session.device || session.device.ownerId !== session.teacherId || session.device.status !== "ACTIVE") {
      throw conflict("DEVICE_UNAVAILABLE", "Điện thoại phát BLE không còn hoạt động");
    }

    const claimed = await tx.attendanceSession.updateMany({
      where: { id: sessionId, status: { in: ["DRAFT", "SCHEDULED"] } },
      data: { status: "ACTIVE" },
    });
    if (claimed.count !== 1) {
      throw conflict("SESSION_NOT_STARTABLE", "Phiên điểm danh đã được xử lý ở nơi khác");
    }

    const roster = await tx.classMember.findMany({
      where: {
        classId: session.classId,
        status: "ACTIVE",
        user: { role: "STUDENT" },
      },
      select: {
        id: true,
        userId: true,
        user: { select: { studentCode: true, name: true } },
      },
      orderBy: { id: "asc" },
    });
    if (roster.length === 0) {
      throw conflict("CLASS_HAS_NO_STUDENTS", "Lớp chưa có sinh viên đang hoạt động");
    }

    await tx.attendanceSessionParticipant.createMany({
      data: roster.map((member) => ({
        sessionId,
        studentId: member.userId,
        classMemberId: member.id,
        studentCodeSnapshot: member.user.studentCode,
        studentNameSnapshot: member.user.name,
        status: "ACTIVE",
      })),
      skipDuplicates: true,
    });
    await tx.attendanceRecord.createMany({
      data: roster.map((member) => ({
        sessionId,
        studentId: member.userId,
        status: "PENDING",
        verificationStatus: "NOT_STARTED",
        source: "ONLINE",
      })),
      skipDuplicates: true,
    });

    const bleToken = await issueBleToken(tx, session, now);
    await addAuditLog(tx, {
      actorId: user.id,
      sessionId,
      action: "START_SESSION",
      entityType: "AttendanceSession",
      entityId: sessionId,
      metadata: { participantCount: roster.length },
    });

    return {
      sessionId,
      sessionCode: session.sessionCode,
      expiresAt: session.expiresAt,
      participantCount: roster.length,
      bleToken,
    };
  });

  return {
    sessionId: result.sessionId,
    status: "ACTIVE",
    participantCount: result.participantCount,
    bleBroadcast: {
      sessionCode: result.sessionCode,
      token: result.bleToken.token,
      expiresAt: toIso(result.bleToken.expiresAt),
      rotateEverySeconds: BLE_TOKEN_ROTATE_SECONDS,
    },
    sessionExpiresAt: toIso(result.expiresAt),
  };
};

export const rotateTeacherSessionBleToken = async (user, rawSessionId) => {
  const sessionId = parseRequiredId(rawSessionId, "sessionId");
  const now = new Date();
  const result = await prisma.$transaction(async (tx) => {
    const session = await tx.attendanceSession.findUnique({ where: { id: sessionId } });
    if (!session) throw notFound("Không tìm thấy phiên điểm danh");
    await assertSessionManager(tx, user, session);
    if (session.status !== "ACTIVE" || session.expiresAt <= now) {
      throw conflict("SESSION_NOT_ACTIVE", "Phiên điểm danh không còn hoạt động");
    }
    const bleToken = await issueBleToken(tx, session, now);
    return { sessionCode: session.sessionCode, bleToken };
  });

  return {
    sessionId,
    bleBroadcast: {
      sessionCode: result.sessionCode,
      token: result.bleToken.token,
      expiresAt: toIso(result.bleToken.expiresAt),
      rotateEverySeconds: BLE_TOKEN_ROTATE_SECONDS,
    },
  };
};

const finalizeAttendanceSession = async (tx, session, actorId, reason) => {
  const now = new Date();
  const transition = await tx.attendanceSession.updateMany({
    where: { id: session.id, status: "ACTIVE" },
    data: { status: "ENDED", endedAt: now },
  });
  if (transition.count !== 1) return { finalized: false, absentCount: 0 };

  const expiredAttempts = await tx.attendanceAttempt.updateMany({
    where: {
      record: { sessionId: session.id },
      status: { in: ["RECEIVED", "VERIFYING"] },
    },
    data: {
      status: "EXPIRED",
      errorCode: reason === "SESSION_EXPIRED" ? "SESSION_EXPIRED" : "SESSION_ENDED",
      errorMessage: "Phiên điểm danh đã kết thúc",
      submittedAt: now,
    },
  });
  if (expiredAttempts.count > 0) {
    await tx.attendanceRecord.updateMany({
      where: { sessionId: session.id, status: "PENDING", verificationStatus: "VERIFYING" },
      data: { verificationStatus: "REJECTED" },
    });
  }
  const absent = await tx.attendanceRecord.updateMany({
    where: { sessionId: session.id, status: "PENDING" },
    data: { status: "ABSENT" },
  });
  await tx.attendanceSessionConfig.updateMany({
    where: { sessionId: session.id },
    data: {
      bleTokenHash: null,
      bleTokenExpiresAt: now,
      bleStoppedAt: now,
    },
  });
  await addAuditLog(tx, {
    actorId,
    sessionId: session.id,
    action: "STOP_SESSION",
    entityType: "AttendanceSession",
    entityId: session.id,
    metadata: { reason },
  });
  await addAuditLog(tx, {
    actorId,
    sessionId: session.id,
    action: "FINALIZE_SESSION",
    entityType: "AttendanceSession",
    entityId: session.id,
    metadata: { absentCount: absent.count, expiredAttemptCount: expiredAttempts.count, reason },
  });
  await tx.attendanceSessionChallenge.updateMany({
    where: { sessionId: session.id, type: "BLE_TOKEN", consumedAt: null },
    data: { consumedAt: now },
  });
  return { finalized: true, absentCount: absent.count };
};

export const endTeacherSession = async (user, rawSessionId) => {
  const sessionId = parseRequiredId(rawSessionId, "sessionId");
  const result = await prisma.$transaction(async (tx) => {
    const session = await tx.attendanceSession.findUnique({ where: { id: sessionId } });
    if (!session) throw notFound("Không tìm thấy phiên điểm danh");
    await assertSessionManager(tx, user, session);
    if (session.status === "ENDED") {
      return { status: "ENDED", absentCount: 0, endedAt: toIso(session.endedAt) };
    }
    if (session.status !== "ACTIVE") {
      throw conflict("SESSION_NOT_ACTIVE", "Chỉ có thể kết thúc phiên đang hoạt động");
    }

    const finalized = await finalizeAttendanceSession(tx, session, user.id, "TEACHER_ENDED");
    const updated = await tx.attendanceSession.findUnique({ where: { id: sessionId } });
    return {
      status: updated.status,
      absentCount: finalized.absentCount,
      endedAt: toIso(updated.endedAt),
    };
  });
  return { sessionId, ...result };
};
export const finalizeExpiredAttendanceSessions = async () => {
  const now = new Date();
  const expired = await prisma.attendanceSession.findMany({
    where: { status: "ACTIVE", expiresAt: { lte: now } },
    select: { id: true },
  });

  let finalizedCount = 0;
  for (const { id } of expired) {
    const finalized = await prisma.$transaction(async (tx) => {
      const session = await tx.attendanceSession.findUnique({ where: { id } });
      if (!session || session.status !== "ACTIVE" || session.expiresAt > now) return false;
      return (await finalizeAttendanceSession(tx, session, null, "SESSION_EXPIRED")).finalized;
    });
    if (finalized) finalizedCount += 1;
  }
  return finalizedCount;
};
