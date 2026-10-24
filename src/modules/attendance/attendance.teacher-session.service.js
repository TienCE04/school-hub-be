import crypto from "node:crypto";
import prisma from "../../config/prisma.js";
import {
  addAuditLog, assertClassManager, badRequest, notFound, parseAttendanceDate,
  parseDate, parseDateTime, parseOptionalInt, parseRequiredId, toTeacherSessionDto,
} from "./attendance.service.shared.js";

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
