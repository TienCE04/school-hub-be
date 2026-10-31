import prisma from "../../config/prisma.js";
import { assertClassManager, notFound, parseRequiredId, toIso } from "./attendance.service.shared.js";

const authorizeClass = async (user, rawClassId) => {
  const classId = parseRequiredId(rawClassId, "classId");
  await assertClassManager(prisma, user, classId);
  if (!(await prisma.class.findUnique({ where: { id: classId }, select: { id: true } }))) {
    throw notFound("Không tìm thấy lớp");
  }
  return classId;
};

export const getTeacherClassStudentStats = async (user, rawClassId) => {
  const classId = await authorizeClass(user, rawClassId);
  const [members, counts] = await Promise.all([
    prisma.classMember.findMany({
      where: { classId, status: "ACTIVE", user: { is: { role: "STUDENT" } } },
      select: { user: { select: { id: true, name: true, studentCode: true } } },
      orderBy: [{ user: { name: "asc" } }, { id: "asc" }],
    }),
    prisma.attendanceRecord.groupBy({
      by: ["studentId", "status"],
      where: { session: { is: { classId } } },
      _count: { _all: true },
    }),
  ]);
  const totals = new Map();
  for (const row of counts) {
    const total = totals.get(row.studentId) || { countCheckIn: 0, totalSessions: 0 };
    total.totalSessions += row._count._all;
    if (["PRESENT", "LATE"].includes(row.status)) total.countCheckIn += row._count._all;
    totals.set(row.studentId, total);
  }
  return { students: members.map(({ user: student }) => ({
    studentId: student.id,
    studentName: student.name || "",
    studentCode: student.studentCode || "",
    countCheckIn: totals.get(student.id)?.countCheckIn || 0,
    totalSessions: totals.get(student.id)?.totalSessions || 0,
  })) };
};

export const getTeacherStudentRecords = async (user, rawClassId, rawStudentId) => {
  const classId = await authorizeClass(user, rawClassId);
  const studentId = parseRequiredId(rawStudentId, "studentId");
  const records = await prisma.attendanceRecord.findMany({
    where: { studentId, session: { is: { classId } } },
    select: {
      id: true, sessionId: true, status: true, verificationStatus: true, checkedInAt: true,
      session: { select: { attendanceDate: true, startsAt: true } },
    },
    orderBy: [{ session: { attendanceDate: "desc" } }, { session: { startsAt: "desc" } }, { id: "desc" }],
  });
  return { records: records.map((record) => ({
    recordId: record.id,
    sessionId: record.sessionId,
    attendanceDate: toIso(record.session.attendanceDate),
    startsAt: toIso(record.session.startsAt),
    status: record.status,
    verificationStatus: record.verificationStatus,
    checkedInAt: toIso(record.checkedInAt),
  })) };
};
