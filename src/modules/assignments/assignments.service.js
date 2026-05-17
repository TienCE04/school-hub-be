import * as repo from "./assignments.repository.js";
import prisma from "../../config/prisma.js";
import { getIO } from "../../realtime/gateway/index.js";
import { SOCKET_EVENTS } from "../../realtime/events/index.js";

/**
 * CREATE ASSIGNMENT
 * - Only TEACHER / ADMIN
 */
export const createAssignment = async (authorId, data) => {
  // Check class tồn tại + user thuộc class + role
  const classData = await prisma.class.findUnique({
    where: { code: data.classCode },
    include: {
      members: {
        where: { userId: authorId },
        include: { user: true }
      },
    },
  });

  if (!classData) throw new Error("Class not found");

  const userInClass = classData.members[0]?.user;
  if (!userInClass || !["TEACHER", "ADMIN"].includes(userInClass.role)) {
    throw new Error("Permission denied");
  }

  const assignmentData = { ...data, classId: classData.id };
  delete assignmentData.classCode;

  const assignment = await repo.createAssignment(authorId, assignmentData);

  try {
    const io = getIO();
    io.to(`class:${data.classId}`).emit(SOCKET_EVENTS.ASSIGNMENT_CREATED, {
      type: "assignment",
      data: {
        assignmentId: assignment.id.toString(),
        classId: assignment.classId.toString(),
        type: "NEW_ASSIGNMENT"
      }
    });
  } catch (err) {
    console.error("Socket error on createAssignment:", err);
  }

  return assignment;
};

/**
 * GET ASSIGNMENT DETAIL
 * - Teacher: xem tất cả
 * - Student: chỉ xem của mình
 */
export const getAssignmentDetail = async (userId, postId) => {
  const assignment = await repo.getAssignmentWithSubmissions(postId);

  if (!assignment) throw new Error("Assignment not found");

  const allStudents = assignment.class?.members?.map((m) => m.user) || [];
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
            student: {
              id: student.id,
              name: student.name,
              avatar: student.avatar || "",
              email: student.email,
              role: student.role,
            },
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
            student: {
              id: currentUser.id,
              name: currentUser.name,
              avatar: currentUser.avatar || "",
              email: currentUser.email,
              role: currentUser.role,
            },
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
          members: { include: { user: true } },
        },
      },
    },
  });

  if (!assignment) throw new Error("Assignment not found");

  // Check user thuộc class
  const userInClass = assignment.class.members.find((m) => m.userId === userId)?.user;

  if (!userInClass) {
    throw new Error("User not in this class");
  }

  if (userInClass.role !== "STUDENT") {
    throw new Error("Only students can submit");
  }

  // Check deadline
  const now = new Date();
  const status = now > assignment.dueDate ? "LATE" : "SUBMITTED";

  const submission = await repo.upsertSubmission(userId, postId, {
    attachments,
    status,
  });

  try {
    const io = getIO();
    // Notify the author (teacher) of the assignment
    io.to(`user:${assignment.authorId}`).emit(SOCKET_EVENTS.NOTIFICATION_RECEIVED, {
      type: "notification",
      data: {
        id: Date.now().toString(),
        title: "New Submission",
        content: `User ${userId} has submitted assignment ${postId}`,
        type: "SUBMISSION",
        submissionId: submission.id.toString()
      }
    });
  } catch (err) {
    console.error("Socket error on submitAssignment:", err);
  }

  return {
    id: submission.id,
    student: {
      id: submission.student.id,
      name: submission.student.name,
      avatar: submission.student.avatar || "",
      email: submission.student.email,
      role: submission.student.role,
    },
    status: submission.status,
    grade: submission.grade,
    feedback: submission.feedback,
    submittedAt: submission.submittedAt?.toISOString(),
    attachments: submission.attachments,
  };
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
              members: { include: { user: true } },
            },
          },
        },
      },
    },
  });

  if (!submission) throw new Error("Submission not found");

  const classUsers = submission.post.class.members.map((m) => m.user);

  const teacher = classUsers.find((u) => u.id === teacherId);

  if (!teacher || !["TEACHER", "ADMIN"].includes(teacher.role)) {
    throw new Error("Permission denied");
  }

  const updatedSubmission = await prisma.submission.update({
    where: { id: submissionId },
    data: {
      grade: data.grade,
      feedback: data.feedback,
    },
  });

  try {
    const io = getIO();
    // Notify the student about the grade
    io.to(`user:${submission.studentId}`).emit(SOCKET_EVENTS.NOTIFICATION_RECEIVED, {
      type: "notification",
      data: {
        id: Date.now().toString(),
        title: "Assignment Graded",
        content: `Your submission for assignment ${submission.postId} has been graded`,
        type: "GRADE",
        grade: data.grade,
        submissionId: submissionId.toString()
      }
    });
  } catch (err) {
    console.error("Socket error on gradeSubmission:", err);
  }

  return {
    id: updatedSubmission.id,
    student: {
      id: updatedSubmission.student.id,
      name: updatedSubmission.student.name,
      avatar: updatedSubmission.student.avatar || "",
      email: updatedSubmission.student.email,
      role: updatedSubmission.student.role,
    },
    status: updatedSubmission.status,
    grade: updatedSubmission.grade,
    feedback: updatedSubmission.feedback,
    submittedAt: updatedSubmission.submittedAt?.toISOString(),
    attachments: updatedSubmission.attachments,
  };
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
      student: true,
    },
    orderBy: { submittedAt: "desc" },
  });

  return submissions.map((s) => ({
    assignment: {
      id: s.post.id,
      title: s.post.title,
      dueDate: s.post.dueDate,
    },
    submission: {
      id: s.id,
      student: {
        id: s.student.id,
        name: s.student.name,
        avatar: s.student.avatar || "",
        email: s.student.email,
        role: s.student.role,
      },
      status: s.status,
      grade: s.grade,
      feedback: s.feedback,
      submittedAt: s.submittedAt,
      attachments: s.attachments,
    }
  }));
};

/**
 * GET MY TASKS
 * Groups assignments into upcoming, pastDue, and submitted
 */
export const getMyTasks = async (userId) => {
  const assignments = await prisma.post.findMany({
    where: {
      type: "ASSIGNMENT",
      class: {
        members: {
          some: { userId },
        },
      },
    },
    include: {
      class: true,
      submissions: {
        where: { studentId: userId },
      },
    },
    orderBy: { dueDate: "asc" },
  });

  const now = new Date();
  const upcoming = [];
  const pastDue = [];
  const submitted = [];

  assignments.forEach((assignment) => {
    const hasSubmission = assignment.submissions && assignment.submissions.length > 0;

    const taskData = {
      id: assignment.id,
      title: assignment.title,
      content: assignment.content,
      dueDate: assignment.dueDate,
      classCode: assignment.class.code,
      className: assignment.class.name,
      submission: hasSubmission
        ? {
          id: assignment.submissions[0].id,
          submittedAt: assignment.submissions[0].submittedAt,
          grade: assignment.submissions[0].grade,
          feedback: assignment.submissions[0].feedback,
          status: assignment.submissions[0].status,
          postId: assignment.submissions[0].postId,
          studentId: assignment.submissions[0].studentId,
        }
        : null,
    };

    if (hasSubmission) {
      submitted.push(taskData);
    } else {
      if (assignment.dueDate && assignment.dueDate < now) {
        pastDue.push(taskData);
      } else {
        upcoming.push(taskData);
      }
    }
  });

  return { upcoming, pastDue, submitted };
};


