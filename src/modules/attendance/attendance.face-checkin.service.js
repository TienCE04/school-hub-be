import prisma from "../../config/prisma.js";
import { hashToken } from "../../shared/utils/hash.js";
import { decryptFaceEmbedding } from "./face-embedding.crypto.js";
import {
  badRequest, conflict, cosineSimilarity, FACE_CHALLENGE_ACTIONS, fail,
  getAttemptExpiry, getFaceThreshold, getStudentAttempt, hasUsableFaceSampleSet,
  normalizeEmbedding, parseId, toIso,
} from "./attendance.checkin.shared.js";

export const submitFaceEvidence = async (studentId, rawAttemptId, body = {}) => {
  const attemptId = parseId(rawAttemptId, "attemptId");
  const modelName = String(body.modelName || "").trim();
  const modelVersion = String(body.modelVersion || "").trim();
  const challengeNonce = String(body.challengeNonce || "").trim();
  const completedChallengeType = String(body.completedChallengeType || "").trim().toUpperCase();
  const livenessPassed = body.livenessPassed;
  if (!modelName || modelName.length > 80 || !modelVersion || modelVersion.length > 80) {
    throw badRequest("modelName and modelVersion are required");
  }
  if (!challengeNonce || challengeNonce.length > 200) throw badRequest("challengeNonce is invalid");
  if (!FACE_CHALLENGE_ACTIONS.includes(completedChallengeType)) throw badRequest("completedChallengeType is invalid");
  if (typeof livenessPassed !== "boolean") throw badRequest("livenessPassed must be a boolean");
  const { vector: probeEmbedding, dimension } = normalizeEmbedding(body.probeEmbedding, "probeEmbedding");
  if (body.dimension != null && Number(body.dimension) !== dimension) throw badRequest("dimension does not match probeEmbedding");
  const qualityScore = body.qualityScore == null ? null : Number(body.qualityScore);
  if (qualityScore !== null && (!Number.isFinite(qualityScore) || qualityScore < 0 || qualityScore > 1)) {
    throw badRequest("qualityScore must be between 0 and 1");
  }
  const now = new Date();

  return prisma.$transaction(async (tx) => {
    const attempt = await getStudentAttempt(tx, studentId, attemptId);
    const { record, faceVerification, bleEvidence } = attempt;
    const session = record.session;
    if (faceVerification) {
      return {
        attemptId,
        attemptStatus: attempt.status,
        attendanceStatus: record.status,
        verificationStatus: record.verificationStatus,
        checkedInAt: toIso(record.checkedInAt),
        reasonCode: faceVerification.failureReason || null,
        nextStep: attempt.status === "VERIFIED" || attempt.status === "PENDING_REVIEW"
          ? "VIEW_RESULT"
          : "RETRY_CHECKIN",
      };
    }
    if (attempt.status === "VERIFIED" || attempt.status === "PENDING_REVIEW") {
      return {
        attemptId,
        attemptStatus: attempt.status,
        attendanceStatus: record.status,
        verificationStatus: record.verificationStatus,
        checkedInAt: toIso(record.checkedInAt),
        nextStep: "VIEW_RESULT",
      };
    }
    if (attempt.status !== "VERIFYING" || bleEvidence?.status !== "VERIFIED") {
      throw conflict("BLE_VERIFICATION_REQUIRED", "Cần được backend xác nhận BLE trước khi gửi khuôn mặt");
    }
    const maxAttemptSeconds = session.config?.maxAttemptSeconds || 30;
    if (getAttemptExpiry(attempt, maxAttemptSeconds) <= now) {
      await tx.attendanceAttempt.update({
        where: { id: attemptId },
        data: { status: "EXPIRED", errorCode: "ATTEMPT_EXPIRED", submittedAt: now },
      });
      await tx.attendanceRecord.updateMany({
        where: { id: record.id, status: "PENDING" },
        data: { verificationStatus: "REJECTED" },
      });
      return {
        attemptId,
        attemptStatus: "EXPIRED",
        attendanceStatus: "PENDING",
        verificationStatus: "REJECTED",
        checkedInAt: null,
        reasonCode: "ATTEMPT_EXPIRED",
        nextStep: "RETRY_CHECKIN",
      };
    }
    if (session.status !== "ACTIVE" || session.expiresAt <= now || session.startsAt > now) {
      throw conflict("SESSION_NOT_ACTIVE", "Phiên điểm danh hiện không nhận check-in");
    }

    const faceProfile = await tx.faceProfile.findUnique({
      where: { userId: studentId },
      include: { samples: { where: { isActive: true }, orderBy: { id: "asc" } } },
    });
    if (!faceProfile || faceProfile.status !== "ACTIVE" || faceProfile.consentRevokedAt
        || (faceProfile.retentionExpiresAt && faceProfile.retentionExpiresAt <= now)
        || !hasUsableFaceSampleSet(faceProfile.samples)) {
      throw conflict("FACE_PROFILE_REQUIRED", "Hồ sơ khuôn mặt không còn hiệu lực");
    }
    if (faceProfile.modelName !== modelName || faceProfile.modelVersion !== modelVersion
        || faceProfile.samples.some((sample) => sample.dimension !== dimension
          || sample.modelName !== modelName || sample.modelVersion !== modelVersion)) {
      throw fail(422, "FACE_MODEL_MISMATCH", "Model hoặc chiều embedding không khớp hồ sơ đã đăng ký");
    }

    const challenge = await tx.attendanceSessionChallenge.findFirst({
      where: {
        sessionId: session.id,
        attemptId,
        type: "FACE_CHALLENGE",
        faceAction: completedChallengeType,
        challengeHash: hashToken(challengeNonce),
        consumedAt: null,
        expiresAt: { gt: now },
      },
      orderBy: { issuedAt: "desc" },
    });
    if (!challenge) throw fail(422, "FACE_CHALLENGE_INVALID", "Face challenge không hợp lệ hoặc đã hết hạn");

    const isCaptureMode = completedChallengeType === "CAPTURE";
    if (isCaptureMode && session.config?.faceLivenessRequired !== false) {
      throw conflict("FACE_CAPTURE_MODE_DISABLED", "Phiên này yêu cầu xác minh liveness");
    }
    if (isCaptureMode === livenessPassed) {
      throw badRequest("livenessPassed does not match the selected face verification mode");
    }
    const threshold = getFaceThreshold();

    const consumed = await tx.attendanceSessionChallenge.updateMany({
      where: { id: challenge.id, consumedAt: null, expiresAt: { gt: now } },
      data: { consumedAt: now },
    });
    if (consumed.count !== 1) throw conflict("FACE_CHALLENGE_USED", "Face challenge đã được sử dụng");

    let similarityScore = null;
    let resultStatus;
    let attemptStatus;
    let recordStatus;
    let verificationStatus;
    let reasonCode = null;
    let checkedInAt = null;
    let errorMessage = null;

    if (!livenessPassed && !isCaptureMode) {
      resultStatus = "FAILED";
      attemptStatus = "REJECTED";
      recordStatus = "PENDING";
      verificationStatus = "REJECTED";
      reasonCode = "LIVENESS_FAILED";
      errorMessage = "Liveness challenge chưa đạt";
    } else {
      const templates = faceProfile.samples.map((sample) => ({
        sampleType: sample.sampleType,
        embedding: decryptFaceEmbedding(sample.embedding),
      }));
      const scores = templates.map(({ embedding }) => cosineSimilarity(probeEmbedding, embedding));
      if (scores.some((score) => score === null || !Number.isFinite(score))) {
        throw fail(500, "FACE_SAMPLE_INTEGRITY_ERROR", "Không thể so khớp một mẫu khuôn mặt đã lưu");
      }
      similarityScore = Math.max(...scores);
      const isMatch = similarityScore >= threshold;
      const lateAt = new Date(session.startsAt.getTime() + (session.config?.lateAfterMinutes || 0) * 60_000);
      const isLate = now > lateAt;

      if (isMatch && isLate && !session.config?.allowLate) {
        resultStatus = "FAILED";
        attemptStatus = "REJECTED";
        recordStatus = "PENDING";
        verificationStatus = "REJECTED";
        reasonCode = "LATE_CHECKIN_CLOSED";
        errorMessage = "Đã qua thời gian cho phép điểm danh muộn";
      } else if (isMatch) {
        resultStatus = "VERIFIED";
        attemptStatus = "VERIFIED";
        recordStatus = isLate ? "LATE" : "PRESENT";
        verificationStatus = "VERIFIED";
        checkedInAt = now;
      } else if (session.config?.allowManualReview) {
        resultStatus = "REVIEW_REQUIRED";
        attemptStatus = "PENDING_REVIEW";
        recordStatus = "REVIEW";
        verificationStatus = "REVIEW_REQUIRED";
        reasonCode = "FACE_MATCH_REVIEW_REQUIRED";
      } else {
        resultStatus = "FAILED";
        attemptStatus = "REJECTED";
        recordStatus = "PENDING";
        verificationStatus = "REJECTED";
        reasonCode = "FACE_NOT_MATCHED";
        errorMessage = "Không xác minh được khuôn mặt; hãy thử lại";
      }
    }

    await tx.attendanceFaceVerification.create({
      data: {
        attemptId,
        challengeType: completedChallengeType,
        challengeHash: hashToken(challengeNonce),
        challengeExpiresAt: challenge.expiresAt,
        modelName,
        modelVersion,
        embeddingDimension: dimension,
        similarityScore,
        livenessScore: null,
        qualityScore,
        status: resultStatus,
        evidenceUrl: null,
        processedAt: now,
        failureReason: reasonCode,
      },
    });

    const recordUpdated = await tx.attendanceRecord.updateMany({
      where: { id: record.id, status: "PENDING" },
      data: {
        status: recordStatus,
        verificationStatus,
        checkedInAt,
        source: "ONLINE",
      },
    });
    if (recordUpdated.count !== 1) {
      throw conflict("ATTENDANCE_ALREADY_FINAL", "Kết quả điểm danh đã được chốt");
    }
    await tx.attendanceAttempt.update({
      where: { id: attemptId },
      data: {
        status: attemptStatus,
        submittedAt: now,
        serverReceivedAt: now,
        errorCode: reasonCode,
        errorMessage,
      },
    });

    return {
      attemptId,
      attemptStatus,
      attendanceStatus: recordStatus,
      verificationStatus,
      checkedInAt: toIso(checkedInAt),
      reasonCode,
      nextStep: attemptStatus === "VERIFIED" || attemptStatus === "PENDING_REVIEW"
        ? "VIEW_RESULT"
        : "RETRY_CHECKIN",
    };
  });
};
