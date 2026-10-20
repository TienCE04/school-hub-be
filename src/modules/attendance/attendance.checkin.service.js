import crypto from "node:crypto";
import prisma from "../../config/prisma.js";
import { hashToken } from "../../shared/utils/hash.js";
import { decryptFaceEmbedding, encryptFaceEmbedding } from "./face-embedding.crypto.js";

const FACE_CHALLENGE_TTL_SECONDS = 30;
const REQUIRED_SAMPLE_TYPES = ["FRONT", "LEFT", "RIGHT"];
const FACE_SAMPLE_TYPES = [...REQUIRED_SAMPLE_TYPES, "EXTRA"];
const FACE_CHALLENGE_ACTIONS = ["BLINK", "SMILE", "TURN_LEFT", "TURN_RIGHT", "NOD"];
const RECORD_STATUSES = ["PENDING", "PRESENT", "LATE", "ABSENT", "EXCUSED", "REVIEW", "REJECTED"];

const toIso = (value) => (value ? new Date(value).toISOString() : null);

const fail = (statusCode, code, message) => {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.code = code;
  return error;
};

const badRequest = (message) => fail(400, "VALIDATION_ERROR", message);
const conflict = (code, message) => fail(409, code, message);
const notFound = (message) => fail(404, "NOT_FOUND", message);

const parseId = (value, fieldName) => {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) throw badRequest(`Invalid ${fieldName}`);
  return parsed;
};

const parseDateTime = (value, fieldName, { optional = false } = {}) => {
  if ((value === undefined || value === null || value === "") && optional) return null;
  if (!value) throw badRequest(`${fieldName} is required`);
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) throw badRequest(`Invalid ${fieldName}`);
  return parsed;
};

const getRetentionDays = () => {
  const raw = process.env.ATTENDANCE_FACE_RETENTION_DAYS;
  const days = raw === undefined || raw === "" ? 365 : Number(raw);
  if (!Number.isInteger(days) || days < 1 || days > 3650) {
    throw fail(503, "FACE_RETENTION_NOT_CONFIGURED", "Face profile retention configuration is invalid");
  }
  return days;
};

const getFaceThreshold = () => {
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

const normalizeEmbedding = (value, fieldName) => {
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

const cosineSimilarity = (left, right) => {
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

const addAuditLog = (tx, { actorId, sessionId = null, action, entityType, entityId, metadata = {} }) =>
  tx.attendanceAuditLog.create({
    data: { actorId, sessionId, action, entityType, entityId, metadata },
  });

const studentFaceProfileDto = (profile, activeSampleCount) => ({
  status: profile?.status || "NOT_ENROLLED",
  sampleCount: activeSampleCount,
  consentAt: toIso(profile?.consentAt),
  consentVersion: profile?.consentVersion || null,
  modelName: profile?.modelName || null,
  modelVersion: profile?.modelVersion || null,
  retentionExpiresAt: toIso(profile?.retentionExpiresAt),
});

const getAttemptExpiry = (attempt, maxAttemptSeconds) => {
  const startedAt = attempt.initiatedAt || attempt.createdAt;
  return new Date(startedAt.getTime() + maxAttemptSeconds * 1000);
};

const issueFaceChallenge = async (tx, sessionId, attemptId, now) => {
  const nonce = crypto.randomBytes(32).toString("base64url");
  const faceAction = FACE_CHALLENGE_ACTIONS[crypto.randomInt(0, FACE_CHALLENGE_ACTIONS.length)];
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

const getSessionManager = async (tx, user, sessionId) => {
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

const getStudentAttempt = async (tx, userId, attemptId) => {
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

const getAttemptResponse = (attempt, sessionStatus = undefined, idempotent = false) => {
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

const markAttemptRejected = async (tx, attempt, record, { code, message, now }) => {
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

export const getStudentSessionDetail = async (studentId, rawSessionId) => {
  const sessionId = parseId(rawSessionId, "sessionId");
  const participant = await prisma.attendanceSessionParticipant.findUnique({
    where: { sessionId_studentId: { sessionId, studentId } },
    include: { session: {
      include: {
        class: { select: { id: true, name: true, code: true } },
        subject: { select: { id: true, title: true, subjectCode: true, location: true } },
        teacher: { select: { id: true, name: true } },
        config: true,
        records: { where: { studentId }, take: 1 },
      },
    } },
  });
  if (!participant || participant.status !== "ACTIVE") throw notFound("Không tìm thấy phiên điểm danh");

  const session = participant.session;
  const record = session.records[0] || null;
  const faceProfile = await prisma.faceProfile.findUnique({
    where: { userId: studentId },
    select: {
      status: true,
      consentRevokedAt: true,
      retentionExpiresAt: true,
      samples: { where: { isActive: true }, select: { id: true } },
    },
  });
  const now = new Date();
  const faceReady = faceProfile?.status === "ACTIVE"
    && !faceProfile.consentRevokedAt
    && (!faceProfile.retentionExpiresAt || faceProfile.retentionExpiresAt > now)
    && faceProfile.samples.length >= 3;
  return {
    sessionId: session.id,
    // The student must match this session when several teacher phones are advertising nearby.
    // sessionCode is an identifier only; the short-lived BLE token remains the secret.
    sessionCode: session.sessionCode,
    classId: session.classId,
    className: session.class?.name || "",
    classCode: session.class?.code || "",
    subjectName: session.subject?.title || session.subject?.subjectCode || "Môn học",
    teacherName: session.teacher?.name || "",
    attendanceDate: toIso(session.attendanceDate),
    startsAt: toIso(session.startsAt),
    expiresAt: toIso(session.expiresAt),
    endedAt: toIso(session.endedAt),
    room: session.subject?.location || "",
    status: session.status,
    attendanceStatus: record?.status || "PENDING",
    verificationStatus: record?.verificationStatus || "NOT_STARTED",
    checkedInAt: toIso(record?.checkedInAt),
    checkInAvailable: session.status === "ACTIVE"
      && session.startsAt <= now
      && session.expiresAt > now
      && record?.status === "PENDING"
      && (!session.config?.requireFace || faceReady),
    faceProfileRequired: Boolean(session.config?.requireFace),
    faceProfileReady: faceReady,
    bleMinScanCount: session.config?.bleMinScanCount || 1,
    bleScanDurationSeconds: session.config?.bleScanDurationSeconds || 0,
  };
};

export const recordFaceConsent = async (studentId, body = {}) => {
  const consentVersion = String(body.consentVersion || "").trim();
  const purposes = body.purposes;
  if (!consentVersion || consentVersion.length > 40) throw badRequest("consentVersion must be 1-40 characters");
  if (!Array.isArray(purposes) || purposes.length !== 1 || purposes[0] !== "ATTENDANCE_FACE_VERIFICATION") {
    throw badRequest("purposes must include ATTENDANCE_FACE_VERIFICATION only");
  }

  const now = new Date();
  const result = await prisma.$transaction(async (tx) => {
    const existing = await tx.faceProfile.findUnique({ where: { userId: studentId } });
    const existingUsable = existing?.status === "ACTIVE"
      && !existing.consentRevokedAt
      && (!existing.retentionExpiresAt || existing.retentionExpiresAt > now);
    if (existingUsable) {
      throw conflict("FACE_PROFILE_ALREADY_ENROLLED", "Hồ sơ khuôn mặt đã được đăng ký");
    }
    if (existing?.status === "PENDING" && existing.consentVersion === consentVersion && existing.consentAt) {
      return { profile: existing, idempotent: true };
    }
    if (existing) await tx.faceEmbeddingSample.deleteMany({ where: { profileId: existing.id } });

    const profile = await tx.faceProfile.upsert({
      where: { userId: studentId },
      create: {
        userId: studentId,
        status: "PENDING",
        consentAt: now,
        consentVersion,
        consentRevokedAt: null,
        revokedReason: null,
      },
      update: {
        status: "PENDING",
        consentAt: now,
        consentVersion,
        consentRevokedAt: null,
        retentionExpiresAt: null,
        revokedReason: null,
        modelName: null,
        modelVersion: null,
        enrolledAt: null,
      },
    });
    await addAuditLog(tx, {
      actorId: studentId,
      action: "ENROLL_FACE",
      entityType: "FaceProfile",
      entityId: profile.id,
      metadata: { stage: "CONSENT_RECORDED", consentVersion, purposes },
    });
    return { profile, idempotent: false };
  });

  return {
    status: result.profile.status,
    consentAt: toIso(result.profile.consentAt),
    consentVersion: result.profile.consentVersion,
    purpose: "ATTENDANCE_FACE_VERIFICATION",
    idempotent: result.idempotent,
  };
};

export const enrollFaceProfile = async (studentId, body = {}) => {
  const samples = body.samples;
  if (!Array.isArray(samples) || samples.length < 3 || samples.length > 4) {
    throw badRequest("samples must contain three required poses and at most one EXTRA sample");
  }

  const normalized = samples.map((sample, index) => {
    if (!sample || typeof sample !== "object" || Array.isArray(sample)) throw badRequest(`samples[${index}] is invalid`);
    const sampleType = String(sample.sampleType || "").trim().toUpperCase();
    if (!FACE_SAMPLE_TYPES.includes(sampleType)) throw badRequest(`samples[${index}].sampleType is invalid`);
    const modelName = String(sample.modelName || "").trim();
    const modelVersion = String(sample.modelVersion || "").trim();
    if (!modelName || modelName.length > 80 || !modelVersion || modelVersion.length > 80) {
      throw badRequest(`samples[${index}] must specify modelName and modelVersion`);
    }
    const { vector, dimension } = normalizeEmbedding(sample.embedding, `samples[${index}].embedding`);
    const qualityScore = sample.qualityScore == null
      ? null
      : Number(sample.qualityScore);
    if (qualityScore !== null && (!Number.isFinite(qualityScore) || qualityScore < 0 || qualityScore > 1)) {
      throw badRequest(`samples[${index}].qualityScore must be between 0 and 1`);
    }
    return {
      sampleType,
      modelName,
      modelVersion,
      dimension,
      vector,
      qualityScore,
      yaw: sample.yaw == null ? null : Number(sample.yaw),
      pitch: sample.pitch == null ? null : Number(sample.pitch),
      roll: sample.roll == null ? null : Number(sample.roll),
      capturedAt: parseDateTime(sample.capturedAt, `samples[${index}].capturedAt`, { optional: true }),
    };
  });

  const sampleTypes = normalized.map((sample) => sample.sampleType);
  if (new Set(sampleTypes).size !== sampleTypes.length
      || REQUIRED_SAMPLE_TYPES.some((required) => !sampleTypes.includes(required))) {
    throw badRequest("Enrollment must contain exactly one FRONT, LEFT and RIGHT sample, with at most one EXTRA");
  }
  const modelName = normalized[0].modelName;
  const modelVersion = normalized[0].modelVersion;
  const dimension = normalized[0].dimension;
  if (normalized.some((sample) => sample.modelName !== modelName
      || sample.modelVersion !== modelVersion
      || sample.dimension !== dimension)) {
    throw badRequest("All enrollment samples must use the same model, version and embedding dimension");
  }

  const now = new Date();
  const retentionExpiresAt = new Date(now.getTime() + getRetentionDays() * 24 * 60 * 60 * 1000);

  const enrollment = await prisma.$transaction(async (tx) => {
    const current = await tx.faceProfile.findUnique({
      where: { userId: studentId },
      include: { samples: { where: { isActive: true }, select: { id: true } } },
    });
    if (current?.status === "ACTIVE"
        && current.modelName === modelName
        && current.modelVersion === modelVersion
        && current.samples.length === normalized.length) {
      return { profile: current, sampleCount: current.samples.length, idempotent: true };
    }
    if (!current || current.status !== "PENDING" || !current.consentAt || current.consentRevokedAt) {
      throw conflict("FACE_CONSENT_REQUIRED", "Cần ghi nhận đồng ý trước khi đăng ký khuôn mặt");
    }
    const encryptedSamples = normalized.map((sample) => ({
      ...sample,
      encryptedEmbedding: encryptFaceEmbedding(sample.vector),
    }));
    const updated = await tx.faceProfile.update({
      where: { id: current.id },
      data: {
        status: "ACTIVE",
        modelName,
        modelVersion,
        enrolledAt: now,
        retentionExpiresAt,
        revokedReason: null,
      },
    });
    await tx.faceEmbeddingSample.deleteMany({ where: { profileId: current.id } });
    await tx.faceEmbeddingSample.createMany({
      data: encryptedSamples.map((sample) => ({
        profileId: current.id,
        embedding: sample.encryptedEmbedding,
        dimension: sample.dimension,
        modelName: sample.modelName,
        modelVersion: sample.modelVersion,
        sampleType: sample.sampleType,
        qualityScore: sample.qualityScore,
        yaw: Number.isFinite(sample.yaw) ? sample.yaw : null,
        pitch: Number.isFinite(sample.pitch) ? sample.pitch : null,
        roll: Number.isFinite(sample.roll) ? sample.roll : null,
        capturedAt: sample.capturedAt,
        sourceUrl: null,
        isActive: true,
      })),
    });
    await addAuditLog(tx, {
      actorId: studentId,
      action: "ENROLL_FACE",
      entityType: "FaceProfile",
      entityId: current.id,
      metadata: { stage: "ENROLLED", sampleCount: encryptedSamples.length, modelName, modelVersion, dimension },
    });
    return { profile: updated, sampleCount: encryptedSamples.length, idempotent: false };
  });

  const profile = enrollment.profile;
  return {
    status: profile.status,
    sampleCount: enrollment.sampleCount,
    modelName: profile.modelName,
    modelVersion: profile.modelVersion,
    dimension,
    enrolledAt: toIso(profile.enrolledAt),
    retentionExpiresAt: toIso(profile.retentionExpiresAt),
    idempotent: enrollment.idempotent,
  };
};

export const revokeFaceConsent = async (studentId) => {
  const now = new Date();
  const result = await prisma.$transaction(async (tx) => {
    const profile = await tx.faceProfile.findUnique({ where: { userId: studentId } });
    if (!profile) return { status: "NOT_ENROLLED", deletedSampleCount: 0, revokedAt: null };
    if (profile.status === "SUSPENDED" && profile.consentRevokedAt) {
      const sampleCount = await tx.faceEmbeddingSample.count({ where: { profileId: profile.id, isActive: true } });
      if (sampleCount === 0) return { status: profile.status, deletedSampleCount: 0, revokedAt: toIso(profile.consentRevokedAt) };
    }

    const deleted = await tx.faceEmbeddingSample.deleteMany({ where: { profileId: profile.id } });
    await tx.faceProfile.update({
      where: { id: profile.id },
      data: { status: "SUSPENDED", consentRevokedAt: now, revokedReason: "CONSENT_REVOKED" },
    });
    await addAuditLog(tx, {
      actorId: studentId,
      action: "SUSPEND_FACE_PROFILE",
      entityType: "FaceProfile",
      entityId: profile.id,
      metadata: { reason: "CONSENT_REVOKED", deletedSampleCount: deleted.count },
    });
    return { status: "SUSPENDED", deletedSampleCount: deleted.count, revokedAt: toIso(now) };
  });
  return result;
};

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
        include: { samples: { where: { isActive: true }, select: { id: true } } },
      });
      if (!faceProfile || faceProfile.status !== "ACTIVE" || faceProfile.samples.length < 3
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

export const submitBleEvidence = async (studentId, rawAttemptId, body = {}) => {
  const attemptId = parseId(rawAttemptId, "attemptId");
  const advertisedSessionCode = String(body.advertisedSessionCode || "").trim().toUpperCase();
  const token = String(body.token || "").trim();
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
      const renewedChallenge = await issueFaceChallenge(tx, session.id, attemptId, now);
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
    const faceChallenge = await issueFaceChallenge(tx, session.id, attemptId, now);
    return { attemptId, status: "BLE_VERIFIED", nextStep: "FACE_VERIFICATION", faceChallenge };
  });
};

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
  const livenessScore = body.livenessScore == null ? null : Number(body.livenessScore);
  const qualityScore = body.qualityScore == null ? null : Number(body.qualityScore);
  if (livenessScore !== null && (!Number.isFinite(livenessScore) || livenessScore < 0 || livenessScore > 1)) {
    throw badRequest("livenessScore must be between 0 and 1");
  }
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
        || faceProfile.samples.length < 3) {
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

    if (!livenessPassed && session.config?.faceLivenessRequired) {
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
        livenessScore,
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

export const getTeacherSessionRecords = async (user, rawSessionId, query = {}) => {
  const sessionId = parseId(rawSessionId, "sessionId");
  const page = query.page === undefined ? 1 : Number(query.page);
  const limit = query.limit === undefined ? 50 : Number(query.limit);
  const status = query.status ? String(query.status).trim().toUpperCase() : undefined;
  if (!Number.isInteger(page) || page < 1) throw badRequest("page must be a positive integer");
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw badRequest("limit must be an integer from 1 to 100");
  if (status && !RECORD_STATUSES.includes(status)) throw badRequest("Invalid attendance status");

  const session = await prisma.$transaction(async (tx) => getSessionManager(tx, user, sessionId));
  const where = { sessionId, ...(status ? { status } : {}) };
  const [total, records, grouped] = await Promise.all([
    prisma.attendanceRecord.count({ where }),
    prisma.attendanceRecord.findMany({
      where,
      orderBy: [{ status: "asc" }, { studentId: "asc" }],
      skip: (page - 1) * limit,
      take: limit,
      include: {
        student: { select: { id: true, name: true, studentCode: true } },
        reviews: {
          orderBy: { createdAt: "desc" },
          take: 1,
          include: { reviewer: { select: { id: true, name: true } } },
        },
      },
    }),
    prisma.attendanceRecord.groupBy({
      by: ["status"],
      where: { sessionId },
      _count: { _all: true },
    }),
  ]);
  const participantRows = await prisma.attendanceSessionParticipant.findMany({
    where: { sessionId, studentId: { in: records.map((record) => record.studentId) } },
    select: { studentId: true, studentCodeSnapshot: true, studentNameSnapshot: true },
  });
  const snapshots = new Map(participantRows.map((participant) => [participant.studentId, participant]));
  const summary = Object.fromEntries(RECORD_STATUSES.map((value) => [value, 0]));
  for (const item of grouped) summary[item.status] = item._count._all;

  return {
    session: {
      id: session.id,
      sessionId: session.id,
      classId: session.classId,
      className: session.class?.name || "",
      classCode: session.class?.code || "",
      subjectName: session.subject?.title || session.subject?.subjectCode || "Môn học",
      teacherName: session.teacher?.name || "",
      attendanceDate: toIso(session.attendanceDate),
      startsAt: toIso(session.startsAt),
      expiresAt: toIso(session.expiresAt),
      endedAt: toIso(session.endedAt),
      status: session.status,
      participantCount: session._count.participants,
    },
    summary,
    records: records.map((record) => {
      const snapshot = snapshots.get(record.studentId);
      const review = record.reviews[0] || null;
      return {
        id: record.id,
        recordId: record.id,
        studentId: record.studentId,
        studentName: snapshot?.studentNameSnapshot || record.student.name || "",
        studentCode: snapshot?.studentCodeSnapshot || record.student.studentCode || "",
        status: record.status,
        verificationStatus: record.verificationStatus,
        source: record.source,
        attemptedAt: toIso(record.attemptedAt),
        checkedInAt: toIso(record.checkedInAt),
        reviewedAt: toIso(record.reviewedAt),
        reviewedBy: review?.reviewer?.name || null,
        reviewNote: record.reviewNote || null,
      };
    }),
    page,
    limit,
    total,
    totalPages: Math.ceil(total / limit),
  };
};

export const getTeacherSessionDetail = async (user, rawSessionId) => {
  const sessionId = parseId(rawSessionId, "sessionId");
  const session = await prisma.$transaction(async (tx) => getSessionManager(tx, user, sessionId));
  const grouped = await prisma.attendanceRecord.groupBy({
    by: ["status"],
    where: { sessionId },
    _count: { _all: true },
  });
  const summary = Object.fromEntries(RECORD_STATUSES.map((status) => [status, 0]));
  for (const row of grouped) summary[row.status] = row._count._all;

  return {
    id: session.id,
    sessionId: session.id,
    classId: session.classId,
    className: session.class?.name || "",
    classCode: session.class?.code || "",
    subjectId: session.subjectId,
    subjectName: session.subject?.title || session.subject?.subjectCode || "Môn học",
    teacherName: session.teacher?.name || "",
    attendanceDate: toIso(session.attendanceDate),
    startsAt: toIso(session.startsAt),
    expiresAt: toIso(session.expiresAt),
    endedAt: toIso(session.endedAt),
    status: session.status,
    device: session.device ? {
      id: session.device.id,
      name: session.device.name,
      type: session.device.type,
      status: session.device.status,
      lastSeenAt: toIso(session.device.lastSeenAt),
    } : null,
    config: session.config ? {
      requireBle: session.config.requireBle,
      requireFace: session.config.requireFace,
      faceLivenessRequired: session.config.faceLivenessRequired,
      allowLate: session.config.allowLate,
      lateAfterMinutes: session.config.lateAfterMinutes,
      allowManualReview: session.config.allowManualReview,
      bleMinScanCount: session.config.bleMinScanCount,
      bleScanDurationSeconds: session.config.bleScanDurationSeconds,
    } : null,
    participantCount: session._count.participants,
    summary,
  };
};

export const reviewAttendanceRecord = async (user, rawRecordId, body = {}) => {
  const recordId = parseId(rawRecordId, "recordId");
  const decision = String(body.decision || "").trim().toUpperCase();
  const note = String(body.note || "").trim();
  if (!["MARK_PRESENT", "MARK_ABSENT"].includes(decision)) {
    throw badRequest("decision must be MARK_PRESENT or MARK_ABSENT");
  }
  if (!note || note.length > 500) throw badRequest("note must be 1-500 characters");

  const now = new Date();
  return prisma.$transaction(async (tx) => {
    const record = await tx.attendanceRecord.findUnique({
      where: { id: recordId },
      include: { session: { include: { config: true } } },
    });
    if (!record) throw notFound("Không tìm thấy record điểm danh");
    const session = await getSessionManager(tx, user, record.sessionId);
    if (!session.config?.allowManualReview) throw conflict("MANUAL_REVIEW_DISABLED", "Phiên không cho phép giảng viên xử lý thủ công");
    if (record.status !== "REVIEW") throw conflict("RECORD_NOT_REVIEWABLE", "Chỉ record đang chờ review mới được xử lý");

    const nextStatus = decision === "MARK_PRESENT" ? "PRESENT" : "ABSENT";
    const updatedCount = await tx.attendanceRecord.updateMany({
      where: { id: recordId, status: "REVIEW" },
      data: {
        status: nextStatus,
        source: "MANUAL",
        checkedInAt: decision === "MARK_PRESENT" ? (record.checkedInAt || now) : null,
        reviewedById: user.id,
        reviewedAt: now,
        reviewNote: note,
      },
    });
    if (updatedCount.count !== 1) throw conflict("RECORD_ALREADY_REVIEWED", "Record đã được xử lý ở nơi khác");

    await tx.attendanceReview.create({
      data: {
        recordId,
        reviewerId: user.id,
        decision,
        note,
        previousStatus: record.status,
        newStatus: nextStatus,
        previousVerificationStatus: record.verificationStatus,
        newVerificationStatus: record.verificationStatus,
        reasonCode: "FACE_MATCH_REVIEW_REQUIRED",
      },
    });
    await addAuditLog(tx, {
      actorId: user.id,
      sessionId: record.sessionId,
      action: "REVIEW_RECORD",
      entityType: "AttendanceRecord",
      entityId: recordId,
      metadata: { decision, previousStatus: record.status, newStatus: nextStatus },
    });

    return {
      recordId,
      studentId: record.studentId,
      status: nextStatus,
      verificationStatus: record.verificationStatus,
      reviewedById: user.id,
      reviewedAt: toIso(now),
      reviewNote: note,
    };
  });
};

export const purgeExpiredFaceProfiles = async () => {
  const now = new Date();
  const profiles = await prisma.faceProfile.findMany({
    where: { status: "ACTIVE", retentionExpiresAt: { lte: now } },
    select: { id: true, userId: true, retentionExpiresAt: true },
  });
  let purgedCount = 0;
  for (const candidate of profiles) {
    const purged = await prisma.$transaction(async (tx) => {
      const current = await tx.faceProfile.findUnique({ where: { id: candidate.id } });
      if (!current || current.status !== "ACTIVE" || !current.retentionExpiresAt || current.retentionExpiresAt > now) {
        return false;
      }
      const deleted = await tx.faceEmbeddingSample.deleteMany({ where: { profileId: current.id } });
      await tx.faceProfile.update({
        where: { id: current.id },
        data: { status: "SUSPENDED", revokedReason: "RETENTION_EXPIRED" },
      });
      await addAuditLog(tx, {
        actorId: null,
        action: "SUSPEND_FACE_PROFILE",
        entityType: "FaceProfile",
        entityId: current.id,
        metadata: { reason: "RETENTION_EXPIRED", deletedSampleCount: deleted.count },
      });
      return true;
    });
    if (purged) purgedCount += 1;
  }
  return purgedCount;
};

export const purgeExpiredAttendanceFaceEvidence = async () => {
  const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const sessions = await prisma.attendanceSession.findMany({
    where: { endedAt: { lte: cutoff } },
    select: { id: true },
  });
  if (sessions.length === 0) return 0;
  const sessionIds = sessions.map((session) => session.id);
  const attempts = await prisma.attendanceAttempt.findMany({
    where: { record: { sessionId: { in: sessionIds } } },
    select: { id: true },
  });
  const attemptIds = attempts.map((attempt) => attempt.id);
  let clearedCount = 0;
  if (attemptIds.length > 0) {
    const cleared = await prisma.attendanceFaceVerification.updateMany({
      where: {
        attemptId: { in: attemptIds },
        OR: [
          { challengeType: { not: null } },
          { challengeHash: { not: null } },
          { challengeExpiresAt: { not: null } },
          { similarityScore: { not: null } },
          { livenessScore: { not: null } },
          { qualityScore: { not: null } },
          { evidenceUrl: { not: null } },
        ],
      },
      data: {
        challengeType: null,
        challengeHash: null,
        challengeExpiresAt: null,
        similarityScore: null,
        livenessScore: null,
        qualityScore: null,
        evidenceUrl: null,
      },
    });
    clearedCount = cleared.count;
  }
  await prisma.attendanceSessionChallenge.deleteMany({ where: { sessionId: { in: sessionIds } } });
  return clearedCount;
};
