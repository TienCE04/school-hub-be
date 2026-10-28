import crypto from "node:crypto";
import { hashToken } from "../../shared/utils/hash.js";

export const FACE_CHALLENGE_TTL_SECONDS = 60;
export const REQUIRED_SAMPLE_TYPES = ["FRONT", "LEFT", "RIGHT"];
export const PROFILE_AVATAR_SAMPLE_TYPE = "PROFILE_AVATAR";
export const FACE_SAMPLE_TYPES = [...REQUIRED_SAMPLE_TYPES, "EXTRA", PROFILE_AVATAR_SAMPLE_TYPE];
export const FACE_LIVENESS_ACTIONS = ["BLINK", "SMILE", "TURN_LEFT", "TURN_RIGHT", "NOD"];
export const FACE_CHALLENGE_ACTIONS = [...FACE_LIVENESS_ACTIONS, "CAPTURE"];
export const FACE_VERIFICATION_MODES = ["LIVENESS", "CAPTURE"];
export const RECORD_STATUSES = ["PENDING", "PRESENT", "LATE", "ABSENT", "EXCUSED", "REVIEW", "REJECTED"];

export const hasUsableFaceSampleSet = (samples = []) => {
  if (!Array.isArray(samples)) return false;
  const types = samples.map((sample) => String(sample?.sampleType || "").trim().toUpperCase());
  if (types.length === 1 && types[0] === PROFILE_AVATAR_SAMPLE_TYPE) return true;
  return types.length >= REQUIRED_SAMPLE_TYPES.length
    && types.length <= REQUIRED_SAMPLE_TYPES.length + 1
    && new Set(types).size === types.length
    && REQUIRED_SAMPLE_TYPES.every((type) => types.includes(type))
    && types.every((type) => FACE_SAMPLE_TYPES.includes(type) && type !== PROFILE_AVATAR_SAMPLE_TYPE);
};

export const getFaceEnrollmentMethod = (samples = []) => {
  if (!hasUsableFaceSampleSet(samples)) return null;
  return String(samples[0]?.sampleType || "").trim().toUpperCase() === PROFILE_AVATAR_SAMPLE_TYPE
    ? PROFILE_AVATAR_SAMPLE_TYPE
    : "CAMERA_3_POSE";
};

export const toIso = (value) => (value ? new Date(value).toISOString() : null);

export const fail = (statusCode, code, message) => {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.code = code;
  return error;
};

export const badRequest = (message) => fail(400, "VALIDATION_ERROR", message);
export const conflict = (code, message) => fail(409, code, message);
export const notFound = (message) => fail(404, "NOT_FOUND", message);

export const parseId = (value, fieldName) => {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) throw badRequest(`Invalid ${fieldName}`);
  return parsed;
};

export const parseDateTime = (value, fieldName, { optional = false } = {}) => {
  if ((value === undefined || value === null || value === "") && optional) return null;
  if (!value) throw badRequest(`${fieldName} is required`);
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) throw badRequest(`Invalid ${fieldName}`);
  return parsed;
};

export const getRetentionDays = () => {
  const raw = process.env.ATTENDANCE_FACE_RETENTION_DAYS;
  const days = raw === undefined || raw === "" ? 365 : Number(raw);
  if (!Number.isInteger(days) || days < 1 || days > 3650) {
    throw fail(503, "FACE_RETENTION_NOT_CONFIGURED", "Face profile retention configuration is invalid");
  }
  return days;
};

export const getFaceThreshold = () => {
  const raw = process.env.ATTENDANCE_FACE_SIMILARITY_THRESHOLD;
  if (raw === undefined || raw === "") {
    throw fail(503, "FACE_VERIFICATION_NOT_CONFIGURED", "Face verification threshold is not configured");
  }
  const threshold = Number(raw);
  if (!Number.isFinite(threshold) || threshold < 0 || threshold > 1) {
    throw fail(503, "FACE_VERIFICATION_NOT_CONFIGURED", "Face verification threshold configuration is invalid");
  }
  return threshold;
};

export const normalizeEmbedding = (value, fieldName) => {
  if (!Array.isArray(value) || value.length < 16 || value.length > 4096) {
    throw badRequest(`${fieldName} must contain 16-4096 numeric values`);
  }
  const vector = value.map((item, index) => {
    if (typeof item !== "number" || !Number.isFinite(item) || Math.abs(item) > 1_000_000) {
      throw badRequest(`${fieldName}[${index}] must be a finite number`);
    }
    return item;
  });
  const norm = Math.sqrt(vector.reduce((sum, item) => sum + item * item, 0));
  if (!Number.isFinite(norm) || norm === 0) throw badRequest(`${fieldName} cannot be a zero vector`);
  return { vector, dimension: vector.length };
};

export const cosineSimilarity = (left, right) => {
  if (left.length !== right.length) return null;
  let dot = 0;
  let leftNorm = 0;
  let rightNorm = 0;
  for (let index = 0; index < left.length; index += 1) {
    dot += left[index] * right[index];
    leftNorm += left[index] * left[index];
    rightNorm += right[index] * right[index];
  }
  if (leftNorm === 0 || rightNorm === 0) return null;
  return dot / (Math.sqrt(leftNorm) * Math.sqrt(rightNorm));
};

export const addAuditLog = (tx, { actorId, sessionId = null, action, entityType, entityId, metadata = {} }) =>
  tx.attendanceAuditLog.create({
    data: { actorId, sessionId, action, entityType, entityId, metadata },
  });

export const getAttemptExpiry = (attempt, maxAttemptSeconds) => {
  const startedAt = attempt.initiatedAt || attempt.createdAt;
  return new Date(startedAt.getTime() + maxAttemptSeconds * 1000);
};

export const issueFaceChallenge = async (tx, sessionId, attemptId, now, mode = "LIVENESS") => {
  const nonce = crypto.randomBytes(32).toString("base64url");
  const faceAction = mode === "CAPTURE"
    ? "CAPTURE"
    : FACE_LIVENESS_ACTIONS[crypto.randomInt(0, FACE_LIVENESS_ACTIONS.length)];
  const expiresAt = new Date(now.getTime() + FACE_CHALLENGE_TTL_SECONDS * 1000);
  await tx.attendanceSessionChallenge.create({
    data: {
      sessionId,
      attemptId,
      type: "FACE_CHALLENGE",
      faceAction,
      challengeHash: hashToken(nonce),
      nonce,
      issuedAt: now,
      expiresAt,
      singleUse: true,
    },
  });
  return { type: faceAction, nonce, expiresAt: toIso(expiresAt) };
};

export const getSessionManager = async (tx, user, sessionId) => {
  const session = await tx.attendanceSession.findUnique({
    where: { id: sessionId },
    include: {
      config: true,
      device: true,
      class: { select: { id: true, name: true, code: true } },
      subject: { select: { id: true, title: true, subjectCode: true } },
      teacher: { select: { id: true, name: true } },
      _count: { select: { participants: true } },
    },
  });
  if (!session) throw notFound("Không tìm thấy phiên điểm danh");
  if (user.role !== "ADMIN" && session.teacherId !== user.id) {
    throw notFound("Không tìm thấy phiên điểm danh");
  }
  return session;
};

export const getStudentAttempt = async (tx, userId, attemptId) => {
  const attempt = await tx.attendanceAttempt.findUnique({
    where: { id: attemptId },
    include: {
      record: {
        include: {
          session: { include: { config: true, device: true } },
        },
      },
      bleEvidence: true,
      faceVerification: true,
    },
  });
  if (!attempt || attempt.record.studentId !== userId) {
    throw notFound("Không tìm thấy lần điểm danh");
  }
  return attempt;
};

export const getAttemptResponse = (attempt, sessionStatus = undefined, idempotent = false) => {
  const maxSeconds = attempt.record.session.config?.maxAttemptSeconds || 30;
  const nextStep = attempt.status === "VERIFIED"
    ? "VIEW_RESULT"
    : attempt.bleEvidence?.status === "VERIFIED"
      ? "FACE_VERIFICATION"
      : attempt.status === "REJECTED" || attempt.status === "EXPIRED"
        ? "RETRY_CHECKIN"
        : "SCAN_BLE";
  return {
    attemptId: attempt.id,
    clientAttemptId: attempt.clientAttemptId,
    status: attempt.status,
    expiresAt: toIso(getAttemptExpiry(attempt, maxSeconds)),
    sessionStatus,
    nextStep,
    idempotent,
  };
};

export const markAttemptRejected = async (tx, attempt, record, { code, message, now }) => {
  await tx.attendanceAttempt.update({
    where: { id: attempt.id },
    data: {
      status: "REJECTED",
      errorCode: code,
      errorMessage: message,
      submittedAt: now,
      serverReceivedAt: now,
    },
  });
  await tx.attendanceRecord.updateMany({
    where: { id: record.id, status: "PENDING" },
    data: { verificationStatus: "REJECTED" },
  });
};

