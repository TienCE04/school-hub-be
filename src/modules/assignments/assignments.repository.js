import prisma from "../../config/prisma.js";

export const createAssignment = async (authorId, data) => {
  const { attachments, ...rest } = data;
  return prisma.post.create({
    data: {
      ...rest,
      authorId,
      attachments: {
        create: attachments,
      },
    },
    include: { attachments: true },
  });
};

export const getAssignmentWithSubmissions = (postId) => {
  return prisma.post.findUnique({
    where: { id: postId },
    include: {
      class: { include: { members: { where: { user: { role: "STUDENT" } }, include: { user: true } } } },
      submissions: {
        include: { student: true, attachments: true },
      },
    },
  });
};

export const upsertSubmission = (studentId, postId, data) => {
  const { attachments, status } = data;
  return prisma.submission.upsert({
    where: {
      studentId_postId: { studentId, postId },
    },
    update: {
      submittedAt: new Date(),
      status,
      attachments: {
        deleteMany: {},
        create: attachments,
      },
    },
    create: {
      studentId,
      postId,
      status,
      attachments: { create: attachments },
    },
    include: {
      student: true,
      attachments: true,
    },
  });
};

export const updateSubmissionGrade = async (submissionId, data) => {
  return prisma.submission.update({
    where: { id: submissionId },
    data: {
      grade: data.grade,
      feedback: data.feedback,
    },
    include: {
      student: true,
      attachments: true,
    },
  });
};

export const getSubmissionById = (submissionId) => {
  return prisma.submission.findUnique({
    where: { id: submissionId },
    include: {
      student: true,
      post: true,
      attachments: true,
    },
  });
};

export const getSubmissionsByAssignment = (postId) => {
  return prisma.submission.findMany({
    where: { postId },
    include: {
      student: true,
      attachments: true,
    },
    orderBy: { submittedAt: "desc" },
  });
};

export const getSubmissionsByStudent = (studentId) => {
  return prisma.submission.findMany({
    where: { studentId },
    include: {
      post: true,
      attachments: true,
    },
    orderBy: { submittedAt: "desc" },
  });
};

/**
 * DELETE SUBMISSION 
 */
export const deleteSubmission = (submissionId) => {
  return prisma.submission.delete({
    where: { id: submissionId },
  });
};
