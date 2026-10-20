import prisma from "../../config/prisma.js";

const normalizeAttachments = (attachments = []) => attachments.map((attachment) => {
  if (typeof attachment === "string") {
    return {
      name: attachment.split("/").pop() || "Attachment",
      url: attachment,
      mimeType: "application/octet-stream",
      size: 0,
    };
  }

  return {
    name: attachment.name || "Attachment",
    url: attachment.url,
    mimeType: attachment.mimeType || "application/octet-stream",
    size: attachment.size || 0,
  };
});

export const createAssignment = async (authorId, data) => {
  const { attachments, ...rest } = data;
  return prisma.post.create({
    data: {
      ...rest,
      authorId,
      attachments: {
        create: normalizeAttachments(attachments),
      },
    },
    include: {
      author: {
        select: {
          id: true,
          name: true,
          email: true,
          avatar: true,
          role: true,
        },
      },
      attachments: true,
      class: true,
    },
  });
};

export const getAssignmentWithSubmissions = (postId) => {
  return prisma.post.findUnique({
    where: { id: postId },
    include: {
      author: {
        select: {
          id: true,
          name: true,
          email: true,
          avatar: true,
          role: true,
        },
      },
      class: { include: { members: { include: { user: true } } } },
      submissions: {
        include: { student: true, attachments: true },
      },
    },
  });
};

export const upsertSubmission = (studentId, postId, data) => {
  const { attachments, status } = data;
  const normalizedAttachments = normalizeAttachments(attachments);

  return prisma.submission.upsert({
    where: {
      studentId_postId: { studentId, postId },
    },
    update: {
      submittedAt: new Date(),
      status,
      attachments: {
        deleteMany: {},
        create: normalizedAttachments,
      },
    },
    create: {
      studentId,
      postId,
      status,
      attachments: { create: normalizedAttachments },
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
      status: data.status || "GRADED",
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
