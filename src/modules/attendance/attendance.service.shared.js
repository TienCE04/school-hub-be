import crypto from "node:crypto";

export const SESSION_STATUSES = ["DRAFT", "SCHEDULED", "ACTIVE", "ENDED", "CANCELLED"];
export const BLE_TOKEN_TTL_SECONDS = 90;
export const BLE_TOKEN_ROTATE_SECONDS = 60;

export const toIso = (value) => (value ? new Date(value).toISOString() : null);

export const badRequest = (message) => {
  const error = new Error(message);
  error.statusCode = 400;
  error.code = "VALIDATION_ERROR";
  return error;
};

export const attendanceError = (statusCode, code, message) => {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.code = code;
  return error;
};

export const conflict = (code, message) => attendanceError(409, code, message);
export const notFound = (message) => attendanceError(404, "NOT_FOUND", message);

export const parseRequiredId = (value, fieldName) => {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) throw badRequest(`Invalid ${fieldName}`);
  return parsed;
};

export const parseDateTime = (value, fieldName) => {
  if (!value) throw badRequest(`${fieldName} is required`);
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) throw badRequest(`Invalid ${fieldName}`);
  return parsed;
};

export const parseAttendanceDate = (value) => {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw badRequest("attendanceDate must use YYYY-MM-DD format");
  }
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) {
    throw badRequest("Invalid attendanceDate");
  }
  return parsed;
};

export const assertClassManager = async (db, user, classId) => {
  if (user.role === "ADMIN") return;

  const member = await db.classMember.findUnique({
    where: { userId_classId: { userId: user.id, classId } },
    select: { status: true, user: { select: { role: true } } },
  });
  if (!member || member.status !== "ACTIVE" || member.user.role !== "TEACHER") {
    throw attendanceError(403, "FORBIDDEN", "Giảng viên không quản lý lớp này");
  }
};

export const assertSessionManager = async (db, user, session) => {
  if (user.role === "ADMIN") return;
  if (session.teacherId !== user.id) {
    throw attendanceError(404, "NOT_FOUND", "Không tìm thấy phiên điểm danh");
  }
};

export const createBleToken = () => crypto.randomBytes(32).toString("base64url");

export const getBleTokenExpiry = (now, sessionExpiry) =>
  new Date(Math.min(now.getTime() + BLE_TOKEN_TTL_SECONDS * 1000, sessionExpiry.getTime()));

export const addAuditLog = (db, { actorId, sessionId = null, action, entityType, entityId, metadata = {} }) =>
  db.attendanceAuditLog.create({
    data: { actorId, sessionId, action, entityType, entityId, metadata },
  });

export const toDeviceDto = (device) => ({
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

export const toTeacherSessionDto = (session) => ({
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

export const parseOptionalInt = (value, fieldName) => {
  if (value === undefined || value === null || value === "") return undefined;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw badRequest(`Invalid ${fieldName}`);
  }
  return parsed;
};

export const parseDate = (value, fieldName, endOfDay = false) => {
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

export const toSessionDto = (session) => {
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

