import * as repo from "./assignments.repository.js";
import prisma from "../../config/prisma.js";

/**
 * CREATE ASSIGNMENT
 * - Only TEACHER / ADMIN
 */
export const createAssignment = async (authorId, data) => {
  // Check class tồn tại + user thuộc class + role
  const classData = await prisma.class.findUnique({
    where: { id: data.classId },
    include: {
      users: {
        where: { id: authorId },
      },
    },
  });

  if (!classData) throw new Error("Class not found");

  const userInClass = classData.users[0];
  if (!userInClass || !["TEACHER", "ADMIN"].includes(userInClass.role)) {
    throw new Error("Permission denied");
  }

  return repo.createAssignment(authorId, data);
};

/**
 * GET ASSIGNMENT DETAIL
 * - Teacher: xem tất cả
 * - Student: chỉ xem của mình
 */
export const getAssignmentDetail = async (userId, postId) => {
  const assignment = await repo.getAssignmentWithSubmissions(postId);

  if (!assignment) throw new Error("Assignment not found");

  const allStudents = assignment.class?.users || [];
  const submissions = assignment.submissions || [];

  // ===== STATS =====
  const submittedCount = submissions.filter(
    (s) => s.status === "SUBMITTED",
  ).length;

  const lateCount = submissions.filter((s) => s.status === "LATE").length;

  const stats = {
    totalStudents: allStudents.length,
    submittedCount,
    lateCount,
    notSubmittedCount: allStudents.length - submittedCount - lateCount,
  };

  // ===== MAP =====
  const submissionMap = new Map(submissions.map((s) => [s.studentId, s]));

  // ===== CHECK ROLE =====
  const currentUser = allStudents.find((u) => u.id === userId);

  if (!currentUser) {
    throw new Error("User not in this class");
  }

  const isTeacher = ["TEACHER", "ADMIN"].includes(currentUser.role);

  // ===== RESPONSE =====
  let students = [];

  if (isTeacher) {
    // Teacher: xem toàn bộ
    students = allStudents.map((student) => {
      const submission = submissionMap.get(student.id);

      return {
        student: {
          id: student.id,
          name: student.name,
          email: student.email,
        },
        assignment: {
          id: assignment.id,
          title: assignment.title,
          dueDate: assignment.dueDate.toISOString(),
        },
        submission: submission
          ? {
              id: submission.id,
              status: submission.status,
              grade: submission.grade,
              feedback: submission.feedback,
              submittedAt: submission.submittedAt?.toISOString(),
              attachments: submission.attachments,
            }
          : null,
      };
    });
  } else {
    // Student: chỉ xem mình
    const submission = submissionMap.get(userId);

    students = [
      {
        student: {
          id: currentUser.id,
          name: currentUser.name,
          email: currentUser.email,
        },
        assignment: {
          id: assignment.id,
          title: assignment.title,
          dueDate: assignment.dueDate.toISOString(),
        },
        submission: submission
          ? {
              id: submission.id,
              status: submission.status,
              grade: submission.grade,
              feedback: submission.feedback,
              submittedAt: submission.submittedAt?.toISOString(),
              attachments: submission.attachments,
            }
          : null,
      },
    ];
  }

  return { stats, students };
};

/**
 * SUBMIT ASSIGNMENT
 * - Only STUDENT
 * - Must belong to class
 */
export const submitAssignment = async (userId, postId, attachments) => {
  const assignment = await prisma.post.findUnique({
    where: { id: postId },
    include: {
      class: {
        include: {
          users: true,
        },
      },
    },
  });

  if (!assignment) throw new Error("Assignment not found");

  // Check user thuộc class
  const userInClass = assignment.class.users.find((u) => u.id === userId);

  if (!userInClass) {
    throw new Error("User not in this class");
  }

  if (userInClass.role !== "STUDENT") {
    throw new Error("Only students can submit");
  }

  // Check deadline
  const now = new Date();
  const status = now > assignment.dueDate ? "LATE" : "SUBMITTED";

  return repo.upsertSubmission(userId, postId, {
    attachments,
    status,
  });
};

/**
 * GRADE SUBMISSION
 * - Only TEACHER / ADMIN
 */
export const gradeSubmission = async (teacherId, submissionId, data) => {
  const submission = await prisma.submission.findUnique({
    where: { id: submissionId },
    include: {
      post: {
        include: {
          class: {
            include: {
              users: true,
            },
          },
        },
      },
    },
  });

  if (!submission) throw new Error("Submission not found");

  const classUsers = submission.post.class.users;

  const teacher = classUsers.find((u) => u.id === teacherId);

  if (!teacher || !["TEACHER", "ADMIN"].includes(teacher.role)) {
    throw new Error("Permission denied");
  }

  return prisma.submission.update({
    where: { id: submissionId },
    data: {
      grade: data.grade,
      feedback: data.feedback,
    },
  });
};

/**
 * GET MY SUBMISSIONS
 */
export const getMySubmissions = async (userId) => {
  const submissions = await prisma.submission.findMany({
    where: { studentId: userId },
    include: {
      post: true,
      attachments: true,
    },
    orderBy: { submittedAt: "desc" },
  });

  return submissions.map((s) => ({
    id: s.id,
    assignment: {
      id: s.post.id,
      title: s.post.title,
      dueDate: s.post.dueDate,
    },
    status: s.status,
    grade: s.grade,
    submittedAt: s.submittedAt,
    attachments: s.attachments,
  }));
};
