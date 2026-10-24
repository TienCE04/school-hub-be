import prisma from "../../config/prisma.js";
import {
  badRequest, parseDate, parseOptionalInt, SESSION_STATUSES, toIso, toSessionDto,
} from "./attendance.service.shared.js";

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
