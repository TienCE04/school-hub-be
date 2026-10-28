import prisma from "../../config/prisma.js";
import {
  addAuditLog, badRequest, conflict, getAttemptResponse, getStudentAttempt,
  hasUsableFaceSampleSet, notFound, parseId,
} from "./attendance.checkin.shared.js";

export const createStudentAttendanceAttempt = async (studentId, rawSessionId, body = {}) => {
  const sessionId = parseId(rawSessionId, "sessionId");
  const clientAttemptId = String(body.clientAttemptId || "").trim();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(clientAttemptId)) {
    throw badRequest("clientAttemptId must be a UUID");
  }
  const clientDeviceId = body.clientDeviceId == null ? null : String(body.clientDeviceId).trim();
  if (clientDeviceId && !/^[A-Za-z0-9._:-]{8,128}$/.test(clientDeviceId)) {
    throw badRequest("clientDeviceId must be 8-128 characters");
  }

  const previous = await prisma.attendanceAttempt.findUnique({
    where: { clientAttemptId },
    include: { record: { include: { session: { include: { config: true } } } }, bleEvidence: true },
  });
  if (previous) {
    if (previous.record.studentId !== studentId || previous.record.sessionId !== sessionId) {
      throw conflict("IDEMPOTENCY_KEY_REUSED", "clientAttemptId đã được dùng cho một lần điểm danh khác");
    }
    return getAttemptResponse(previous, previous.record.session.status, true);
  }

  const now = new Date();
  try {
    const attempt = await prisma.$transaction(async (tx) => {
      const session = await tx.attendanceSession.findUnique({
        where: { id: sessionId },
        include: { config: true },
      });
      if (!session) throw notFound("Không tìm thấy phiên điểm danh");
      if (session.status !== "ACTIVE" || session.startsAt > now || session.expiresAt <= now) {
        throw conflict("SESSION_NOT_ACTIVE", "Phiên điểm danh hiện không nhận check-in");
      }
      if (!session.config?.requireBle || !session.config?.requireFace) {
        throw conflict("SESSION_CONFIGURATION_UNSUPPORTED", "Phiên chưa bật đủ BLE và xác minh khuôn mặt");
      }

      const participant = await tx.attendanceSessionParticipant.findUnique({
        where: { sessionId_studentId: { sessionId, studentId } },
      });
      if (!participant || participant.status !== "ACTIVE") {
        throw notFound("Sinh viên không thuộc danh sách điểm danh của phiên");
      }
      const record = await tx.attendanceRecord.findUnique({
        where: { sessionId_studentId: { sessionId, studentId } },
      });
      if (!record) throw conflict("ATTENDANCE_RECORD_MISSING", "Phiên chưa có record điểm danh cho sinh viên");
      if (record.status !== "PENDING") throw conflict("ATTENDANCE_ALREADY_FINAL", "Kết quả điểm danh đã được chốt");

      const faceProfile = await tx.faceProfile.findUnique({
        where: { userId: studentId },
        include: { samples: { where: { isActive: true }, select: { id: true, sampleType: true } } },
      });
      if (!faceProfile || faceProfile.status !== "ACTIVE" || !hasUsableFaceSampleSet(faceProfile.samples)
          || faceProfile.consentRevokedAt || (faceProfile.retentionExpiresAt && faceProfile.retentionExpiresAt <= now)) {
        throw conflict("FACE_PROFILE_REQUIRED", "Sinh viên cần đăng ký khuôn mặt còn hiệu lực trước khi điểm danh");
      }

      const maxAttemptSeconds = session.config.maxAttemptSeconds || 30;
      const staleBefore = new Date(now.getTime() - maxAttemptSeconds * 1000);
      const staleAttempts = await tx.attendanceAttempt.updateMany({
        where: {
          recordId: record.id,
          status: { in: ["RECEIVED", "VERIFYING"] },
          initiatedAt: { lt: staleBefore },
        },
        data: { status: "EXPIRED", errorCode: "ATTEMPT_EXPIRED", errorMessage: "Lần điểm danh đã hết hạn" },
      });
      if (staleAttempts.count > 0) {
        await tx.attendanceRecord.updateMany({
          where: { id: record.id, status: "PENDING", verificationStatus: "VERIFYING" },
          data: { verificationStatus: "REJECTED" },
        });
      }

      const activeAttempt = await tx.attendanceAttempt.findFirst({
        where: {
          recordId: record.id,
          status: { in: ["RECEIVED", "VERIFYING"] },
        },
        select: { id: true },
      });
      if (activeAttempt) throw conflict("ATTEMPT_ALREADY_ACTIVE", "Đang có một lần điểm danh chưa hoàn tất");

      const recordClaimed = await tx.attendanceRecord.updateMany({
        where: {
          id: record.id,
          status: "PENDING",
          verificationStatus: { not: "VERIFYING" },
        },
        data: { attemptedAt: now, verificationStatus: "VERIFYING" },
      });
      if (recordClaimed.count !== 1) throw conflict("ATTEMPT_ALREADY_ACTIVE", "Đang có một lần điểm danh chưa hoàn tất");

      const created = await tx.attendanceAttempt.create({
        data: {
          recordId: record.id,
          clientAttemptId,
          status: "RECEIVED",
          source: "ONLINE",
          clientDeviceId,
          initiatedAt: now,
          serverReceivedAt: now,
        },
        include: { record: { include: { session: { include: { config: true } } } } },
      });
      await addAuditLog(tx, {
        actorId: studentId,
        sessionId,
        action: "CREATE_ATTEMPT",
        entityType: "AttendanceAttempt",
        entityId: created.id,
        metadata: { recordId: record.id, source: "ONLINE" },
      });
      return created;
    });
    return getAttemptResponse(attempt, "ACTIVE");
  } catch (error) {
    if (error.code !== "P2002") throw error;
    const concurrent = await prisma.attendanceAttempt.findUnique({
      where: { clientAttemptId },
      include: { record: { include: { session: { include: { config: true } } } }, bleEvidence: true },
    });
    if (concurrent?.record.studentId === studentId && concurrent.record.sessionId === sessionId) {
      return getAttemptResponse(concurrent, concurrent.record.session.status, true);
    }
    throw conflict("IDEMPOTENCY_KEY_REUSED", "clientAttemptId đã được dùng cho một lần điểm danh khác");
  }
};

export const cancelStudentAttendanceAttempt = async (studentId, rawAttemptId) => {
  const attemptId = parseId(rawAttemptId, "attemptId");
  const now = new Date();
  return prisma.$transaction(async (tx) => {
    const attempt = await getStudentAttempt(tx, studentId, attemptId);
    if (attempt.status !== "RECEIVED" && attempt.status !== "VERIFYING") {
      return { attemptId, status: attempt.status, cancelled: false };
    }
    await tx.attendanceAttempt.update({
      where: { id: attemptId },
      data: {
        status: "EXPIRED",
        errorCode: "CLIENT_CANCELLED",
        errorMessage: "Sinh viên đã hủy lần điểm danh",
        submittedAt: now,
      },
    });
    await tx.attendanceRecord.updateMany({
      where: { id: attempt.recordId, status: "PENDING", verificationStatus: "VERIFYING" },
      data: { verificationStatus: "REJECTED" },
    });
    await addAuditLog(tx, {
      actorId: studentId,
      sessionId: attempt.record.sessionId,
      action: "CANCEL_ATTEMPT",
      entityType: "AttendanceAttempt",
      entityId: attemptId,
      metadata: { reason: "CLIENT_CANCELLED" },
    });
    return { attemptId, status: "EXPIRED", cancelled: true };
  });
};
