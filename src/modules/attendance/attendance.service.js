import prisma from "../../config/prisma.js";
import crypto from "node:crypto";
import { hashToken } from "../../shared/utils/hash.js";

const SESSION_STATUSES = ["DRAFT", "SCHEDULED", "ACTIVE", "ENDED", "CANCELLED"];
const BLE_TOKEN_TTL_SECONDS = 90;
const BLE_TOKEN_ROTATE_SECONDS = 60;

const toIso = (value) => (value ? new Date(value).toISOString() : null);

const badRequest = (message) => {
  const error = new Error(message);
  error.statusCode = 400;
  error.code = "VALIDATION_ERROR";
  return error;
};

const attendanceError = (statusCode, code, message) => {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.code = code;
  return error;
};

const conflict = (code, message) => attendanceError(409, code, message);
const notFound = (message) => attendanceError(404, "NOT_FOUND", message);

const parseRequiredId = (value, fieldName) => {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) throw badRequest(`Invalid ${fieldName}`);
  return parsed;
};

const parseDateTime = (value, fieldName) => {
  if (!value) throw badRequest(`${fieldName} is required`);
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) throw badRequest(`Invalid ${fieldName}`);
  return parsed;
};

const parseAttendanceDate = (value) => {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw badRequest("attendanceDate must use YYYY-MM-DD format");
  }
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) {
    throw badRequest("Invalid attendanceDate");
  }
  return parsed;
};

const assertClassManager = async (db, user, classId) => {
  if (user.role === "ADMIN") return;

  const member = await db.classMember.findUnique({
    where: { userId_classId: { userId: user.id, classId } },
    select: { status: true, user: { select: { role: true } } },
  });
  if (!member || member.status !== "ACTIVE" || member.user.role !== "TEACHER") {
    throw attendanceError(403, "FORBIDDEN", "Giảng viên không quản lý lớp này");
  }
};

const assertSessionManager = async (db, user, session) => {
  if (user.role === "ADMIN") return;
  if (session.teacherId !== user.id) {
    throw attendanceError(404, "NOT_FOUND", "Không tìm thấy phiên điểm danh");
  }
};

const createBleToken = () => crypto.randomBytes(32).toString("base64url");

const getBleTokenExpiry = (now, sessionExpiry) =>
  new Date(Math.min(now.getTime() + BLE_TOKEN_TTL_SECONDS * 1000, sessionExpiry.getTime()));

const addAuditLog = (db, { actorId, sessionId = null, action, entityType, entityId, metadata = {} }) =>
  db.attendanceAuditLog.create({
    data: { actorId, sessionId, action, entityType, entityId, metadata },
  });

const toDeviceDto = (device) => ({
  id: device.id,
  deviceId: device.id,
  deviceKey: device.deviceKey,
  name: device.name,
  type: device.type,
  status: device.status,
  firmwareVersion: device.firmwareVersion,
  pairedAt: toIso(device.pairedAt),
  lastSeenAt: toIso(device.lastSeenAt),
  createdAt: toIso(device.createdAt),
});

const toTeacherSessionDto = (session) => ({
  id: session.id,
  sessionId: session.id,
  classId: session.classId,
  className: session.class?.name || "",
  classCode: session.class?.code || "",
  subjectId: session.subjectId,
  subjectName: session.subject?.title || session.subject?.subjectCode || "Môn học",
  attendanceDate: toIso(session.attendanceDate),
  startsAt: toIso(session.startsAt),
  expiresAt: toIso(session.expiresAt),
  endedAt: toIso(session.endedAt),
  status: session.status,
  device: session.device ? toDeviceDto(session.device) : null,
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
  participantCount: session._count?.participants ?? session.participantCount ?? 0,
});

const parseOptionalInt = (value, fieldName) => {
  if (value === undefined || value === null || value === "") return undefined;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw badRequest(`Invalid ${fieldName}`);
  }
  return parsed;
};

const parseDate = (value, fieldName, endOfDay = false) => {
  if (value === undefined || value === null || value === "") return undefined;

  const raw = String(value).trim();
  const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(raw);
  const parsed = dateOnly
    ? new Date(`${raw}T${endOfDay ? "23:59:59.999" : "00:00:00.000"}Z`)
    : new Date(raw);

  if (Number.isNaN(parsed.getTime()) || (dateOnly && parsed.toISOString().slice(0, 10) !== raw)) {
    throw badRequest(`Invalid ${fieldName}`);
  }
  return parsed;
};

const toSessionDto = (session) => {
  const record = session.records[0] || null;
  const subject = session.subject;

  return {
    id: session.id,
    sessionId: session.id,
    subjectName: subject?.title || subject?.subjectCode || "Môn học",
    className: session.class?.name || session.class?.code || "Lớp học",
    classCode: session.class?.code || subject?.classCode || "",
    teacherName: session.teacher?.name || "Chưa cập nhật giảng viên",
    attendanceDate: toIso(session.attendanceDate),
    startsAt: toIso(session.startsAt),
    expiresAt: toIso(session.expiresAt),
    room: subject?.location || "",
    sessionStatus: session.status,
    myAttendanceStatus: record?.status || "PENDING",
    checkedInAt: toIso(record?.checkedInAt),
  };
};

export const getMyAttendanceSessions = async (studentId, query = {}) => {
  const classId = parseOptionalInt(query.classId, "classId");
  const from = parseDate(query.from, "from");
  const to = parseDate(query.to, "to", true);
  const status = query.status ? String(query.status).trim().toUpperCase() : undefined;

  if (status && !SESSION_STATUSES.includes(status)) {
    throw badRequest("Invalid attendance session status");
  }
  if (from && to && from > to) {
    throw badRequest("from must be before or equal to to");
  }

  const where = {
    participants: {
      some: { studentId },
    },
  };

  if (classId !== undefined) where.classId = classId;
  if (status) where.status = status;
  if (from || to) {
    where.attendanceDate = {};
    if (from) where.attendanceDate.gte = from;
    if (to) where.attendanceDate.lte = to;
  }

  const sessions = await prisma.attendanceSession.findMany({
    where,
    include: {
      class: {
        select: { id: true, name: true, code: true },
      },
      subject: {
        select: {
          id: true,
          title: true,
          subjectCode: true,
          classCode: true,
          location: true,
        },
      },
      teacher: {
        select: { id: true, name: true },
      },
      records: {
        where: { studentId },
        select: {
          status: true,
          checkedInAt: true,
        },
        take: 1,
      },
    },
    orderBy: [{ attendanceDate: "desc" }, { startsAt: "desc" }],
  });

  return sessions.map(toSessionDto);
};

export const getMyFaceProfile = async (studentId) => {
  const profile = await prisma.faceProfile.findUnique({
    where: { userId: studentId },
    select: {
      status: true,
      modelName: true,
      modelVersion: true,
      consentAt: true,
      consentRevokedAt: true,
      consentVersion: true,
      retentionExpiresAt: true,
      samples: {
        where: { isActive: true },
        select: { id: true },
      },
    },
  });

  if (!profile) {
    return {
      status: "NOT_ENROLLED",
      sampleCount: 0,
      consentAt: null,
      consentVersion: null,
      modelName: null,
      modelVersion: null,
      retentionExpiresAt: null,
    };
  }

  const usable = profile.status === "ACTIVE"
    && !profile.consentRevokedAt
    && (!profile.retentionExpiresAt || profile.retentionExpiresAt > new Date());

  return {
    status: usable ? profile.status : profile.status === "ACTIVE" ? "SUSPENDED" : profile.status,
    sampleCount: usable ? profile.samples.length : 0,
    consentAt: toIso(profile.consentAt),
    consentVersion: profile.consentVersion || null,
    modelName: profile.modelName || null,
    modelVersion: profile.modelVersion || null,
    retentionExpiresAt: toIso(profile.retentionExpiresAt),
  };
};

export const registerTeacherDevice = async (user, body = {}) => {
  const clientDeviceId = String(body.clientDeviceId || "").trim();
  if (!/^[A-Za-z0-9._:-]{8,128}$/.test(clientDeviceId)) {
    throw badRequest("clientDeviceId must be 8-128 characters");
  }

  const name = String(body.name || "Điện thoại giảng viên").trim();
  const appVersion = body.appVersion == null ? null : String(body.appVersion).trim();
  if (!name || name.length > 80) throw badRequest("name must be 1-80 characters");
  if (appVersion && appVersion.length > 40) throw badRequest("appVersion must be at most 40 characters");

  // The installation ID is never stored directly. Hashing it with the owner ID
  // makes retries idempotent for one teacher while keeping installations distinct.
  const deviceKey = hashToken(`attendance-device:${user.id}:${clientDeviceId}`);
  const existing = await prisma.attendanceDevice.findUnique({ where: { deviceKey } });
  if (existing) {
    if (existing.ownerId !== user.id) throw conflict("DEVICE_KEY_CONFLICT", "Device key is already registered");
    if (existing.status === "REVOKED") {
      throw conflict("DEVICE_REVOKED", "Thiết bị đã bị thu hồi; hãy đăng ký lại bằng mã cài đặt mới");
    }
    const refreshed = existing.status === "ACTIVE"
      ? existing
      : await prisma.$transaction(async (tx) => {
        const updated = await tx.attendanceDevice.update({
          where: { id: existing.id },
          data: {
            status: "ACTIVE",
            name,
            firmwareVersion: appVersion,
            pairedAt: new Date(),
          },
        });
        await addAuditLog(tx, {
          actorId: user.id,
          action: "PAIR_DEVICE",
          entityType: "AttendanceDevice",
          entityId: updated.id,
          metadata: { type: updated.type, reactivated: true },
        });
        return updated;
      });
    return { ...toDeviceDto(refreshed), idempotent: true };
  }

  try {
    const device = await prisma.$transaction(async (tx) => {
      const created = await tx.attendanceDevice.create({
        data: {
          deviceKey,
          name,
          type: "TEACHER_PHONE",
          status: "ACTIVE",
          ownerId: user.id,
          firmwareVersion: appVersion,
          pairedAt: new Date(),
        },
      });
      await addAuditLog(tx, {
        actorId: user.id,
        action: "PAIR_DEVICE",
        entityType: "AttendanceDevice",
        entityId: created.id,
        metadata: { type: created.type },
      });
      return created;
    });
    return { ...toDeviceDto(device), idempotent: false };
  } catch (error) {
    if (error.code !== "P2002") throw error;
    const concurrentRegistration = await prisma.attendanceDevice.findUnique({ where: { deviceKey } });
    if (concurrentRegistration?.ownerId === user.id && concurrentRegistration.status === "ACTIVE") {
      return { ...toDeviceDto(concurrentRegistration), idempotent: true };
    }
    throw error;
  }
};

export const getMyTeacherDevices = async (userId) => {
  const devices = await prisma.attendanceDevice.findMany({
    where: { ownerId: userId },
    orderBy: [{ status: "asc" }, { createdAt: "desc" }],
  });
  return devices.map(toDeviceDto);
};

export const revokeTeacherDevice = async (user, rawDeviceId) => {
  const deviceId = parseRequiredId(rawDeviceId, "deviceId");
  const device = await prisma.attendanceDevice.findUnique({ where: { id: deviceId } });
  if (!device || (user.role !== "ADMIN" && device.ownerId !== user.id)) {
    throw notFound("Không tìm thấy thiết bị");
  }
  if (device.status === "REVOKED") return { deviceId, status: "REVOKED" };

  const activeSessions = await prisma.attendanceSession.count({
    where: { deviceId, status: "ACTIVE" },
  });
  if (activeSessions > 0) {
    throw conflict("DEVICE_IN_ACTIVE_SESSION", "Không thể thu hồi thiết bị đang phát trong phiên hoạt động");
  }

  await prisma.$transaction(async (tx) => {
    await tx.attendanceDevice.update({
      where: { id: deviceId },
      data: { status: "REVOKED" },
    });
    await addAuditLog(tx, {
      actorId: user.id,
      action: "REVOKE_DEVICE",
      entityType: "AttendanceDevice",
      entityId: deviceId,
      metadata: { previousStatus: device.status },
    });
  });
  return { deviceId, status: "REVOKED" };
};

export const createTeacherSession = async (user, rawClassId, body = {}) => {
  const classId = parseRequiredId(rawClassId, "classId");
  const subjectId = parseOptionalInt(body.subjectId, "subjectId");
  const deviceId = parseRequiredId(body.deviceId, "deviceId");
  const attendanceDate = parseAttendanceDate(body.attendanceDate);
  const startsAt = parseDateTime(body.startsAt, "startsAt");
  const expiresAt = parseDateTime(body.expiresAt, "expiresAt");
  if (startsAt >= expiresAt) throw badRequest("expiresAt must be after startsAt");

  if (body.config !== undefined && (!body.config || typeof body.config !== "object" || Array.isArray(body.config))) {
    throw badRequest("config must be an object");
  }
  const config = body.config || {};
  const optionalBoolean = (key, defaultValue) => {
    if (config[key] === undefined) return defaultValue;
    if (typeof config[key] !== "boolean") throw badRequest(`${key} must be a boolean`);
    return config[key];
  };
  const requireBle = optionalBoolean("requireBle", true);
  const requireFace = optionalBoolean("requireFace", true);
  const faceLivenessRequired = optionalBoolean("faceLivenessRequired", true);
  const allowLate = optionalBoolean("allowLate", true);
  const allowManualReview = optionalBoolean("allowManualReview", true);
  const lateAfterMinutes = config.lateAfterMinutes === undefined ? 5 : Number(config.lateAfterMinutes);
  const bleMinScanCount = config.bleMinScanCount === undefined ? 3 : Number(config.bleMinScanCount);
  const bleScanDurationSeconds = config.bleScanDurationSeconds === undefined
    ? 8
    : Number(config.bleScanDurationSeconds);
  const maxAttemptSeconds = config.maxAttemptSeconds === undefined ? 90 : Number(config.maxAttemptSeconds);

  if (!Number.isInteger(lateAfterMinutes) || lateAfterMinutes < 0 || lateAfterMinutes > 240) {
    throw badRequest("lateAfterMinutes must be an integer from 0 to 240");
  }
  if (!Number.isInteger(bleMinScanCount) || bleMinScanCount < 1 || bleMinScanCount > 20) {
    throw badRequest("bleMinScanCount must be an integer from 1 to 20");
  }
  if (!Number.isInteger(bleScanDurationSeconds) || bleScanDurationSeconds < 1 || bleScanDurationSeconds > 60) {
    throw badRequest("bleScanDurationSeconds must be an integer from 1 to 60");
  }
  if (!Number.isInteger(maxAttemptSeconds) || maxAttemptSeconds < 10 || maxAttemptSeconds > 180) {
    throw badRequest("maxAttemptSeconds must be an integer from 10 to 180");
  }

  const classRow = await prisma.class.findUnique({ where: { id: classId }, select: { id: true } });
  if (!classRow) throw notFound("Không tìm thấy lớp học");
  await assertClassManager(prisma, user, classId);

  if (subjectId !== undefined) {
    const subject = await prisma.subject.findUnique({
      where: { id: subjectId },
      select: { id: true, classId: true },
    });
    if (!subject || subject.classId !== classId) {
      throw badRequest("subjectId must belong to the selected class");
    }
  }

  const device = await prisma.attendanceDevice.findUnique({ where: { id: deviceId } });
  if (!device || device.ownerId !== user.id || device.status !== "ACTIVE") {
    throw badRequest("deviceId must identify an active device registered to this teacher");
  }

  const sessionCode = crypto.randomBytes(8).toString("hex").toUpperCase();
  const created = await prisma.$transaction(async (tx) => {
    const session = await tx.attendanceSession.create({
      data: {
        classId,
        subjectId: subjectId ?? null,
        teacherId: user.id,
        deviceId,
        sessionCode,
        attendanceDate,
        startsAt,
        expiresAt,
        status: "DRAFT",
        config: {
          create: {
            requireBle,
            requireFace,
            faceLivenessRequired,
            allowLate,
            allowManualReview,
            // Offline check-in is deferred for this implementation phase.
            allowOfflineAttempt: false,
            lateAfterMinutes,
            maxAttemptSeconds,
            bleMinScanCount,
            bleScanDurationSeconds,
          },
        },
      },
      include: {
        class: { select: { id: true, name: true, code: true } },
        subject: { select: { id: true, title: true, subjectCode: true } },
        device: true,
        config: true,
        _count: { select: { participants: true } },
      },
    });
    await addAuditLog(tx, {
      actorId: user.id,
      sessionId: session.id,
      action: "CREATE_SESSION",
      entityType: "AttendanceSession",
      entityId: session.id,
      metadata: { classId, subjectId: subjectId ?? null, deviceId },
    });
    return session;
  });

  return toTeacherSessionDto(created);
};

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
  const token = createBleToken();
  const tokenHash = hashToken(token);

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

    const tokenExpiresAt = getBleTokenExpiry(now, session.expiresAt);
    await tx.attendanceSessionConfig.upsert({
      where: { sessionId },
      create: {
        sessionId,
        allowOfflineAttempt: false,
        bleTokenHash: tokenHash,
        bleTokenExpiresAt: tokenExpiresAt,
        bleStartedAt: now,
      },
      update: {
        bleTokenHash: tokenHash,
        bleTokenExpiresAt: tokenExpiresAt,
        bleStartedAt: now,
        bleStoppedAt: null,
      },
    });
    await tx.attendanceSessionChallenge.create({
      data: {
        sessionId,
        type: "BLE_TOKEN",
        challengeHash: tokenHash,
        tokenFingerprint: tokenHash,
        issuedAt: now,
        expiresAt: tokenExpiresAt,
        singleUse: false,
      },
    });
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
      tokenExpiresAt,
    };
  });

  return {
    sessionId: result.sessionId,
    status: "ACTIVE",
    participantCount: result.participantCount,
    bleBroadcast: {
      sessionCode: result.sessionCode,
      token,
      expiresAt: toIso(result.tokenExpiresAt),
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

export const getTeacherClassSessions = async (user, rawClassId, query = {}) => {
  const classId = parseRequiredId(rawClassId, "classId");
  const from = parseDate(query.from, "from");
  const to = parseDate(query.to, "to", true);
  if (from && to && from > to) throw badRequest("from must be before or equal to to");
  await assertClassManager(prisma, user, classId);

  const where = { classId };
  if (from || to) {
    where.attendanceDate = {};
    if (from) where.attendanceDate.gte = from;
    if (to) where.attendanceDate.lte = to;
  }
  const sessions = await prisma.attendanceSession.findMany({
    where,
    include: {
      class: { select: { id: true, name: true, code: true } },
      subject: { select: { id: true, title: true, subjectCode: true } },
      device: true,
      config: true,
      _count: { select: { participants: true } },
    },
    orderBy: [{ attendanceDate: "desc" }, { startsAt: "desc" }],
  });
  return sessions.map(toTeacherSessionDto);
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
