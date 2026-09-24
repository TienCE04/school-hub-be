import prisma from "../../config/prisma.js";

const toIso = (value) => (value ? new Date(value).toISOString() : null);

const toLeaveRequestDto = (request) => ({
  id: request.id,
  studentId: request.studentId,
  classId: request.classId,
  date: toIso(request.date),
  reason: request.reason,
  evidence: request.evidence || null,
  status: request.status,
  createdAt: toIso(request.createdAt),
  className: request.class?.name || null,
  classCode: request.class?.code || null,
  student: request.student
    ? {
        id: request.student.id,
        name: request.student.name,
        studentCode: request.student.studentCode,
        avatar: request.student.avatar || "",
      }
    : undefined,
});

const getClassMember = (userId, classId) => prisma.classMember.findUnique({
  where: { userId_classId: { userId, classId } },
  include: { user: true },
});

const assertStudentMember = async (studentId, classId) => {
  const member = await getClassMember(studentId, classId);
  if (!member || member.user.role !== "STUDENT") {
    throw new Error("Student is not a member of this class");
  }
};

const assertClassManager = async (user, classId) => {
  if (user.role === "ADMIN") return;

  const member = await getClassMember(user.id, classId);
  if (!member || member.user.role !== "TEACHER") {
    throw new Error("Only a class teacher or admin can perform this action");
  }
};

export const createLeaveRequest = async (data) => {
  if (!Number.isInteger(data.classId) || data.classId <= 0) {
    throw new Error("Invalid classId");
  }
  if (!(data.date instanceof Date) || Number.isNaN(data.date.getTime())) {
    throw new Error("Invalid date");
  }
  if (!data.reason?.trim()) throw new Error("Reason is required");

  await assertStudentMember(data.studentId, data.classId);

  const request = await prisma.leaveRequest.create({
    data: {
      studentId: data.studentId,
      classId: data.classId,
      date: data.date,
      reason: data.reason.trim(),
      evidence: data.evidence || null,
    },
    include: { class: true },
  });

  return toLeaveRequestDto(request);
};

export const getStudentLeaveRequests = async (studentId) => {
  const requests = await prisma.leaveRequest.findMany({
    where: { studentId },
    include: { class: true },
    orderBy: { createdAt: "desc" },
  });

  return requests.map(toLeaveRequestDto);
};

export const getClassLeaveRequests = async (user, classId) => {
  const parsedClassId = Number(classId);
  if (!Number.isInteger(parsedClassId) || parsedClassId <= 0) {
    throw new Error("Invalid classId");
  }

  await assertClassManager(user, parsedClassId);

  const requests = await prisma.leaveRequest.findMany({
    where: { classId: parsedClassId },
    include: {
      class: true,
      student: {
        select: { id: true, name: true, studentCode: true, avatar: true },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  return requests.map(toLeaveRequestDto);
};

export const updateLeaveRequestStatus = async (user, id, status) => {
  if (!["PENDING", "APPROVED", "REJECTED"].includes(status)) {
    throw new Error("Invalid leave request status");
  }

  const request = await prisma.leaveRequest.findUnique({
    where: { id: Number(id) },
  });
  if (!request) throw new Error("Leave request not found");

  await assertClassManager(user, request.classId);

  const updatedRequest = await prisma.leaveRequest.update({
    where: { id: request.id },
    data: { status },
    include: { class: true, student: true },
  });

  return toLeaveRequestDto(updatedRequest);
};

export const getStudentStatistics = async (studentId) => {
  const requests = await prisma.leaveRequest.findMany({ where: { studentId } });

  return requests.reduce(
    (stats, request) => {
      stats.total += 1;
      stats[request.status.toLowerCase()] += 1;
      return stats;
    },
    { total: 0, pending: 0, approved: 0, rejected: 0 },
  );
};

export const getClassStatistics = async (user, classId) => {
  const parsedClassId = Number(classId);
  if (!Number.isInteger(parsedClassId) || parsedClassId <= 0) {
    throw new Error("Invalid classId");
  }

  await assertClassManager(user, parsedClassId);

  const requests = await prisma.leaveRequest.findMany({
    where: { classId: parsedClassId },
  });

  return requests.reduce(
    (stats, request) => {
      stats.total += 1;
      stats[request.status.toLowerCase()] += 1;
      return stats;
    },
    { total: 0, pending: 0, approved: 0, rejected: 0 },
  );
};
