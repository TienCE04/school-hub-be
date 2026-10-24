import prisma from "../../config/prisma.js";
import {
  addAuditLog, badRequest, conflict, getSessionManager, notFound, parseId,
  RECORD_STATUSES, toIso,
} from "./attendance.checkin.shared.js";

export const getTeacherSessionRecords = async (user, rawSessionId, query = {}) => {
  const sessionId = parseId(rawSessionId, "sessionId");
  const page = query.page === undefined ? 1 : Number(query.page);
  const limit = query.limit === undefined ? 50 : Number(query.limit);
  const status = query.status ? String(query.status).trim().toUpperCase() : undefined;
  if (!Number.isInteger(page) || page < 1) throw badRequest("page must be a positive integer");
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw badRequest("limit must be an integer from 1 to 100");
  if (status && !RECORD_STATUSES.includes(status)) throw badRequest("Invalid attendance status");

  const session = await getSessionManager(prisma, user, sessionId);
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
  const session = await getSessionManager(prisma, user, sessionId);
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
