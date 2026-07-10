import prisma from "../../config/prisma.js";

export const createLeaveRequest = async (data) => {
  return await prisma.leaveRequest.create({
    data,
  });
};

export const getStudentLeaveRequests = async (studentId) => {
  return await prisma.leaveRequest.findMany({
    where: { studentId },
    include: {
      class: true,
    },
    orderBy: { createdAt: "desc" },
  });
};

export const getClassLeaveRequests = async (classId) => {
  return await prisma.leaveRequest.findMany({
    where: { classId: parseInt(classId) },
    include: {
      student: {
        select: { id: true, name: true, studentCode: true, avatar: true },
      },
    },
    orderBy: { createdAt: "desc" },
  });
};

export const updateLeaveRequestStatus = async (id, status) => {
  return await prisma.leaveRequest.update({
    where: { id: parseInt(id) },
    data: { status },
  });
};

export const getStudentStatistics = async (studentId) => {
  const requests = await prisma.leaveRequest.findMany({
    where: { studentId },
  });
  
  const stats = {
    total: requests.length,
    pending: 0,
    approved: 0,
    rejected: 0,
  };
  
  requests.forEach(req => {
    if (req.status === 'PENDING') stats.pending++;
    if (req.status === 'APPROVED') stats.approved++;
    if (req.status === 'REJECTED') stats.rejected++;
  });
  
  return stats;
};

export const getClassStatistics = async (classId) => {
  const requests = await prisma.leaveRequest.findMany({
    where: { classId: parseInt(classId) },
  });
  
  const stats = {
    total: requests.length,
    pending: 0,
    approved: 0,
    rejected: 0,
  };
  
  requests.forEach(req => {
    if (req.status === 'PENDING') stats.pending++;
    if (req.status === 'APPROVED') stats.approved++;
    if (req.status === 'REJECTED') stats.rejected++;
  });
  
  return stats;
};
