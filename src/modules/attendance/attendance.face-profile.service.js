import prisma from "../../config/prisma.js";
import { encryptFaceEmbedding } from "./face-embedding.crypto.js";
import {
  addAuditLog, badRequest, conflict, FACE_SAMPLE_TYPES, getRetentionDays,
  getFaceEnrollmentMethod, hasUsableFaceSampleSet, normalizeEmbedding, notFound,
  parseDateTime, parseId, PROFILE_AVATAR_SAMPLE_TYPE, REQUIRED_SAMPLE_TYPES, toIso,
} from "./attendance.checkin.shared.js";

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
      samples: { where: { isActive: true }, select: { sampleType: true } },
    },
  });
  const now = new Date();
  const faceReady = faceProfile?.status === "ACTIVE"
    && !faceProfile.consentRevokedAt
    && (!faceProfile.retentionExpiresAt || faceProfile.retentionExpiresAt > now)
    && hasUsableFaceSampleSet(faceProfile.samples);
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
    faceLivenessRequired: session.config?.faceLivenessRequired !== false,
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
  if (!Array.isArray(samples) || samples.length < 1 || samples.length > 4) {
    throw badRequest("samples must contain one profile avatar or three required poses and at most one EXTRA sample");
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
  const isAvatarEnrollment = sampleTypes.length === 1 && sampleTypes[0] === PROFILE_AVATAR_SAMPLE_TYPE;
  const isCameraEnrollment = sampleTypes.length >= REQUIRED_SAMPLE_TYPES.length
    && sampleTypes.length <= REQUIRED_SAMPLE_TYPES.length + 1
    && REQUIRED_SAMPLE_TYPES.every((required) => sampleTypes.includes(required))
    && !sampleTypes.includes(PROFILE_AVATAR_SAMPLE_TYPE);
  if (new Set(sampleTypes).size !== sampleTypes.length || (!isAvatarEnrollment && !isCameraEnrollment)) {
    throw badRequest("Enrollment must contain only PROFILE_AVATAR or FRONT, LEFT, RIGHT and optionally EXTRA");
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
      include: { samples: { where: { isActive: true }, select: { id: true, sampleType: true } } },
    });
    if (current?.status === "ACTIVE"
        && current.modelName === modelName
        && current.modelVersion === modelVersion
        && current.samples.length === normalized.length
        && current.samples.every((sample) => sampleTypes.includes(sample.sampleType))) {
      return {
        profile: current,
        sampleCount: current.samples.length,
        enrollmentMethod: getFaceEnrollmentMethod(current.samples),
        idempotent: true,
      };
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
      metadata: {
        stage: "ENROLLED",
        sampleCount: encryptedSamples.length,
        enrollmentMethod: isAvatarEnrollment ? PROFILE_AVATAR_SAMPLE_TYPE : "CAMERA_3_POSE",
        modelName,
        modelVersion,
        dimension,
      },
    });
    return {
      profile: updated,
      sampleCount: encryptedSamples.length,
      enrollmentMethod: isAvatarEnrollment ? PROFILE_AVATAR_SAMPLE_TYPE : "CAMERA_3_POSE",
      idempotent: false,
    };
  });

  const profile = enrollment.profile;
  return {
    status: profile.status,
    sampleCount: enrollment.sampleCount,
    modelName: profile.modelName,
    modelVersion: profile.modelVersion,
    enrollmentMethod: enrollment.enrollmentMethod,
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
