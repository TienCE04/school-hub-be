import prisma from "../../config/prisma.js";
import { hashToken } from "../../shared/utils/hash.js";
import {
  badRequest, conflict, getAttemptExpiry, getStudentAttempt, issueFaceChallenge,
  FACE_VERIFICATION_MODES, markAttemptRejected, parseDateTime, parseId, toIso,
} from "./attendance.checkin.shared.js";

export const submitBleEvidence = async (studentId, rawAttemptId, body = {}) => {
  const attemptId = parseId(rawAttemptId, "attemptId");
  const advertisedSessionCode = String(body.advertisedSessionCode || "").trim().toUpperCase();
  const token = String(body.token || "").trim();
  const faceVerificationMode = String(body.faceVerificationMode || "LIVENESS").trim().toUpperCase();
  if (!FACE_VERIFICATION_MODES.includes(faceVerificationMode)) {
    throw badRequest("faceVerificationMode must be LIVENESS or CAPTURE");
  }
  const scanCount = Number(body.scanCount);
  const scanDurationMs = Number(body.scanDurationMs);
  if (!/^[A-F0-9]{16}$/.test(advertisedSessionCode)) throw badRequest("advertisedSessionCode is invalid");
  if (token.length < 20 || token.length > 200) throw badRequest("token is invalid");
  if (!Number.isInteger(scanCount) || scanCount < 1 || scanCount > 100) throw badRequest("scanCount is invalid");
  if (!Number.isInteger(scanDurationMs) || scanDurationMs < 0 || scanDurationMs > 120_000) {
    throw badRequest("scanDurationMs is invalid");
  }

  const rssiMin = body.rssiMin == null ? null : Number(body.rssiMin);
  const rssiMax = body.rssiMax == null ? null : Number(body.rssiMax);
  const rssiAverage = body.rssiAverage == null ? null : Number(body.rssiAverage);
  if ([rssiMin, rssiMax, rssiAverage].some((value) => value !== null && (!Number.isFinite(value) || value < -127 || value > 20))) {
    throw badRequest("RSSI values must be between -127 and 20");
  }
  if ((rssiMin !== null && rssiMax !== null && rssiMin > rssiMax)
      || (rssiAverage !== null && rssiMin !== null && rssiAverage < rssiMin)
      || (rssiAverage !== null && rssiMax !== null && rssiAverage > rssiMax)) {
    throw badRequest("RSSI summary values are inconsistent");
  }
  const firstSeenAt = parseDateTime(body.firstSeenAt, "firstSeenAt", { optional: true });
  const lastSeenAt = parseDateTime(body.lastSeenAt, "lastSeenAt", { optional: true });
  if (firstSeenAt && lastSeenAt && firstSeenAt > lastSeenAt) throw badRequest("firstSeenAt must be before lastSeenAt");

  const now = new Date();
  return prisma.$transaction(async (tx) => {
    const attempt = await getStudentAttempt(tx, studentId, attemptId);
    const session = attempt.record.session;
    const record = attempt.record;
    if (faceVerificationMode === "CAPTURE" && session.config?.faceLivenessRequired !== false) {
      throw conflict("FACE_CAPTURE_MODE_DISABLED", "Phiên này yêu cầu xác minh liveness");
    }
    if (attempt.status === "VERIFIED" || attempt.status === "PENDING_REVIEW") {
      return { attemptId, status: attempt.status, nextStep: "VIEW_RESULT" };
    }
    if (attempt.bleEvidence?.status === "FAILED") {
      return {
        attemptId,
        status: "REJECTED",
        code: attempt.bleEvidence.failureReason || attempt.errorCode || "BLE_EVIDENCE_REJECTED",
        nextStep: "RETRY_CHECKIN",
      };
    }
    if (attempt.status === "EXPIRED") {
      return { attemptId, status: "EXPIRED", code: attempt.errorCode || "ATTEMPT_EXPIRED", nextStep: "RETRY_CHECKIN" };
    }
    if (attempt.status !== "RECEIVED" && attempt.status !== "VERIFYING") {
      throw conflict("ATTEMPT_NOT_ACTIVE", "Lần điểm danh không còn hoạt động; hãy tạo lần thử mới");
    }
    const maxAttemptSeconds = session.config?.maxAttemptSeconds || 30;
    if (getAttemptExpiry(attempt, maxAttemptSeconds) <= now) {
      await tx.attendanceAttempt.update({ where: { id: attemptId }, data: { status: "EXPIRED", errorCode: "ATTEMPT_EXPIRED" } });
      await tx.attendanceRecord.updateMany({
        where: { id: record.id, status: "PENDING" },
        data: { verificationStatus: "REJECTED" },
      });
      return { attemptId, status: "EXPIRED", code: "ATTEMPT_EXPIRED", nextStep: "RETRY_CHECKIN" };
    }

    if (attempt.bleEvidence?.status === "VERIFIED") {
      const previousChallenge = await tx.attendanceSessionChallenge.findFirst({
        where: { attemptId, type: "FACE_CHALLENGE", consumedAt: null, expiresAt: { gt: now } },
        orderBy: { issuedAt: "desc" },
      });
      if (previousChallenge) {
        const previousMode = previousChallenge.faceAction === "CAPTURE" ? "CAPTURE" : "LIVENESS";
        if (previousMode !== faceVerificationMode) {
          throw conflict("FACE_MODE_ALREADY_SELECTED", "Lần thử này đã có một phương thức xác minh đang chờ");
        }
        return {
          attemptId,
          status: "BLE_VERIFIED",
          nextStep: "FACE_VERIFICATION",
          faceChallenge: {
            type: previousChallenge.faceAction,
            nonce: previousChallenge.nonce,
            expiresAt: toIso(previousChallenge.expiresAt),
          },
        };
      }
      const renewedChallenge = await issueFaceChallenge(tx, session.id, attemptId, now, faceVerificationMode);
      return { attemptId, status: "BLE_VERIFIED", nextStep: "FACE_VERIFICATION", faceChallenge: renewedChallenge };
    }

    let failure = null;
    if (session.status !== "ACTIVE" || session.startsAt > now || session.expiresAt <= now) {
      failure = { code: "SESSION_NOT_ACTIVE", message: "Phiên điểm danh hiện không nhận check-in" };
    } else if (!session.config?.requireBle || !session.config?.requireFace) {
      failure = { code: "SESSION_CONFIGURATION_UNSUPPORTED", message: "Phiên chưa bật đủ BLE và xác minh khuôn mặt" };
    } else if (!session.device || session.device.status !== "ACTIVE" || session.device.ownerId !== session.teacherId) {
      failure = { code: "BLE_DEVICE_UNAVAILABLE", message: "Thiết bị phát BLE không còn hoạt động" };
    } else if (advertisedSessionCode !== session.sessionCode) {
      failure = { code: "BLE_SESSION_MISMATCH", message: "Beacon không thuộc phiên điểm danh này" };
    } else if (!session.config.bleTokenExpiresAt || session.config.bleStoppedAt) {
      failure = { code: "BLE_TOKEN_EXPIRED", message: "Token BLE không còn hiệu lực" };
    } else if (scanCount < (session.config.bleMinScanCount || 1)) {
      failure = { code: "BLE_SCAN_INSUFFICIENT", message: "Chưa nhận đủ tín hiệu BLE" };
    } else if (scanDurationMs < (session.config.bleScanDurationSeconds || 0) * 1000) {
      failure = { code: "BLE_SCAN_TOO_SHORT", message: "Thời gian quét BLE chưa đủ" };
    } else if (session.config.bleRssiThreshold != null && rssiAverage != null
        && rssiAverage < session.config.bleRssiThreshold) {
      failure = { code: "BLE_SIGNAL_TOO_WEAK", message: "Tín hiệu BLE quá yếu" };
    }

    if (!failure) {
      const tokenChallenge = await tx.attendanceSessionChallenge.findFirst({
        where: {
          sessionId: session.id,
          type: "BLE_TOKEN",
          tokenFingerprint: hashToken(token),
          issuedAt: { lte: now },
          expiresAt: { gt: now },
          consumedAt: null,
        },
      });
      if (!tokenChallenge) failure = { code: "BLE_TOKEN_INVALID", message: "Token BLE không hợp lệ hoặc đã hết hạn" };
    }

    const attemptStartedAt = attempt.initiatedAt || attempt.createdAt;
    if (firstSeenAt && (firstSeenAt > new Date(now.getTime() + 5_000)
        || firstSeenAt < new Date(attemptStartedAt.getTime() - 5_000))) {
      failure ||= { code: "BLE_OBSERVATION_TIME_INVALID", message: "Thời điểm nhận tín hiệu BLE không hợp lệ" };
    }
    if (lastSeenAt && (lastSeenAt > new Date(now.getTime() + 5_000)
        || lastSeenAt < new Date(attemptStartedAt.getTime() - 5_000))) {
      failure ||= { code: "BLE_OBSERVATION_TIME_INVALID", message: "Thời điểm nhận tín hiệu BLE không hợp lệ" };
    }

    if (failure) {
      await tx.attendanceBleEvidence.create({
        data: {
          attemptId,
          advertisedDeviceKey: session.device?.deviceKey || null,
          advertisedSessionCode,
          tokenFingerprint: hashToken(token),
          rssiMin,
          rssiMax,
          rssiAverage,
          scanCount,
          scanDurationMs,
          firstSeenAt,
          lastSeenAt,
          status: "FAILED",
          failureReason: failure.code,
        },
      });
      await markAttemptRejected(tx, attempt, record, { ...failure, now });
      return { attemptId, status: "REJECTED", code: failure.code, message: failure.message, nextStep: "RETRY_CHECKIN" };
    }

    await tx.attendanceBleEvidence.create({
      data: {
        attemptId,
        advertisedDeviceKey: session.device.deviceKey,
        advertisedSessionCode,
        tokenFingerprint: hashToken(token),
        rssiMin,
        rssiMax,
        rssiAverage,
        scanCount,
        scanDurationMs,
        firstSeenAt,
        lastSeenAt,
        status: "VERIFIED",
        verifiedAt: now,
      },
    });
    await tx.attendanceAttempt.update({
      where: { id: attemptId },
      data: { status: "VERIFYING", submittedAt: now, serverReceivedAt: now },
    });
    const faceChallenge = await issueFaceChallenge(tx, session.id, attemptId, now, faceVerificationMode);
    return { attemptId, status: "BLE_VERIFIED", nextStep: "FACE_VERIFICATION", faceChallenge };
  });
};
