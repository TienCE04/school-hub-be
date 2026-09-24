import * as repo from "./assignments.repository.js";
import prisma from "../../config/prisma.js";
import { getIO } from "../../realtime/gateway/index.js";
import { SOCKET_EVENTS } from "../../realtime/events/index.js";
import { createSocketPayload } from "../../realtime/events/payload.js";
import { sendPushNotification, sendPushNotificationToUsers } from "../../shared/utils/fcm.js";
import {
  toPublicUserDto,
  toStudentAssignmentDetailDto,
  toSubmissionDto,
  toTeacherAssignmentDetailDto,
} from "./dto/assignment-response.dto.js";

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
        include: { user: true }
      },
    },
  });

  if (!classData) throw new Error("Class not found");

  const author = await prisma.user.findUnique({
    where: { id: authorId },
    select: { id: true, role: true },
  });
  const userInClass = classData.members.find((member) => member.userId === authorId)?.user;
  if (!author || (author.role !== "ADMIN" && (!userInClass || userInClass.role !== "TEACHER"))) {
    throw new Error("Permission denied");
  }

  const assignmentData = { ...data, classId: classData.id };
  delete assignmentData.classCode;

  const assignment = await repo.createAssignment(authorId, assignmentData);

  try {
    const io = getIO();
    const payload = createSocketPayload("assignment", SOCKET_EVENTS.ASSIGNMENT_CREATED, {
        assignmentId: assignment.id.toString(),
        classId: assignment.classId.toString(),
        classCode: classData.code,
        action: "created",
        type: "NEW_ASSIGNMENT"
    });

    io.to(`class:${classData.id}`).emit(SOCKET_EVENTS.ASSIGNMENT_CREATED, payload);

    // Send FCM to all members
    const members = classData.members;
    const userIds = members.filter(m => m.userId !== authorId).map(m => m.userId);
    if (userIds.length > 0) {
      sendPushNotificationToUsers(userIds, payload);
    }
  } catch (err) {
    console.error("Socket error on createAssignment:", err);
  }

  return assignment;
};

const getAssignmentForDetail = async (postId) => {
  const assignment = await repo.getAssignmentWithSubmissions(postId);

  if (!assignment) throw new Error("Assignment not found");
  if (assignment.type !== "ASSIGNMENT") throw new Error("Post is not an assignment");

  return assignment;
};

/**
 * GET STUDENT ASSIGNMENT DETAIL
 * Returns the task plus the current student's submission only.
 */
export const getStudentAssignmentDetail = async (userId, postId) => {
  const assignment = await getAssignmentForDetail(postId);
  const currentMember = assignment.class.members.find((member) => member.userId === userId);

  if (!currentMember || currentMember.user.role !== "STUDENT") {
    throw new Error("Student is not in this class");
  }

  const submission = assignment.submissions.find((item) => item.studentId === userId) || null;
  return toStudentAssignmentDetailDto(assignment, submission);
};

/**
 * GET TEACHER ASSIGNMENT DETAIL
 * Returns assignment metadata, statistics and every student's submission.
 */
export const getTeacherAssignmentDetail = async (userId, postId) => {
  const assignment = await getAssignmentForDetail(postId);
  const currentMember = assignment.class.members.find((member) => member.userId === userId);
  const requester = await prisma.user.findUnique({
    where: { id: userId },
    select: { role: true },
  });

  if (!requester || (requester.role !== "ADMIN" && (!currentMember || currentMember.user.role !== "TEACHER"))) {
    throw new Error("Teacher is not allowed to view this assignment");
  }

  const allMembers = assignment.class?.members?.map((m) => m.user) || [];
  const submissions = assignment.submissions || [];
  const allStudents = allMembers.filter((u) => u.role === "STUDENT");

  const submittedStatuses = new Set(["SUBMITTED", "LATE", "GRADED"]);
  const submittedCount = submissions.filter((s) => submittedStatuses.has(s.status)).length;
  const lateCount = submissions.filter((s) => s.status === "LATE").length;
  const gradedCount = submissions.filter((s) => s.status === "GRADED").length;

  const stats = {
    totalStudents: allStudents.length,
    submittedCount,
    lateCount,
    gradedCount,
    notSubmittedCount: Math.max(0, allStudents.length - submittedCount),
  };

  const submissionMap = new Map(submissions.map((s) => [s.studentId, s]));
  const students = allStudents.map((student) => ({
    student: toPublicUserDto(student),
    submission: submissionMap.has(student.id)
      ? toSubmissionDto(submissionMap.get(student.id))
      : null,
  }));

  return toTeacherAssignmentDetailDto(assignment, stats, students);
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
  if (assignment.type !== "ASSIGNMENT") throw new Error("Post is not an assignment");

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
  const status = assignment.dueDate && now > assignment.dueDate ? "LATE" : "SUBMITTED";

  const submission = await repo.upsertSubmission(userId, postId, {
    attachments,
    status,
  });

  try {
    const io = getIO();
    const payload = createSocketPayload("notification", SOCKET_EVENTS.NOTIFICATION_RECEIVED, {
        id: Date.now().toString(),
        title: "New Submission",
        content: `User ${userId} has submitted assignment ${postId}`,
        type: "SUBMISSION",
        submissionId: submission.id.toString()
    });
    
    // Notify the author (teacher) of the assignment
    io.to(`user:${assignment.authorId}`).emit(SOCKET_EVENTS.NOTIFICATION_RECEIVED, payload);

    // Also emit SUBMISSION_CREATED to the teacher
    io.to(`user:${assignment.authorId}`).emit(SOCKET_EVENTS.SUBMISSION_CREATED, createSocketPayload("submission", SOCKET_EVENTS.SUBMISSION_CREATED, {
      submissionId: submission.id.toString(),
      assignmentId: postId.toString(),
      studentId: userId.toString(),
      status: submission.status,
      action: "created",
    }));

    // Always send FCM
    sendPushNotification(assignment.authorId, payload);
  } catch (err) {
    console.error("Socket error on submitAssignment:", err);
  }

  return toSubmissionDto(submission);
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
  if (submission.post.type !== "ASSIGNMENT") throw new Error("Submission does not belong to an assignment");

  const classUsers = submission.post.class.members.map((m) => m.user);

  const teacher = classUsers.find((u) => u.id === teacherId);
  const requester = await prisma.user.findUnique({
    where: { id: teacherId },
    select: { role: true },
  });

  if (!requester || (requester.role !== "ADMIN" && (!teacher || teacher.role !== "TEACHER"))) {
    throw new Error("Permission denied");
  }

  const updatedSubmission = await repo.updateSubmissionGrade(submissionId, {
    grade: data.grade,
    feedback: data.feedback,
    status: "GRADED",
  });

  try {
    const io = getIO();
    const payload = createSocketPayload("notification", SOCKET_EVENTS.NOTIFICATION_RECEIVED, {
        id: Date.now().toString(),
        title: "Assignment Graded",
        content: `Your submission for assignment ${submission.postId} has been graded`,
        type: "GRADE",
        grade: data.grade,
        submissionId: submissionId.toString()
    });

    // Notify the student about the grade
    io.to(`user:${submission.studentId}`).emit(SOCKET_EVENTS.NOTIFICATION_RECEIVED, payload);

    // Also emit SUBMISSION_GRADED
    io.to(`user:${submission.studentId}`).emit(SOCKET_EVENTS.SUBMISSION_GRADED, createSocketPayload("submission", SOCKET_EVENTS.SUBMISSION_GRADED, {
      submissionId: submissionId.toString(),
      assignmentId: submission.postId.toString(),
      grade: data.grade,
      action: "graded",
    }));

    // Always send FCM
    sendPushNotification(submission.studentId, payload);
  } catch (err) {
    console.error("Socket error on gradeSubmission:", err);
  }

  return toSubmissionDto(updatedSubmission);
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


