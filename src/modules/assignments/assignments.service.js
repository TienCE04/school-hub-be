import * as repo from "./assignments.repository.js";
import prisma from "../../config/prisma.js";
import { getIO } from "../../realtime/gateway/index.js";
import { SOCKET_EVENTS } from "../../realtime/events/index.js";
import { createSocketPayload } from "../../realtime/events/payload.js";
import { sendPushNotificationToUsers } from "../../shared/utils/fcm.js";
import { SOCKET_PAYLOAD_TYPES, NOTIFICATION_CATEGORIES } from "../../shared/constants/notification.constants.js";
import {
  ASSIGNMENT_ACTIONS,
  ASSIGNMENT_NOTIFICATION_KINDS,
  ASSIGNMENT_NOTIFICATION_MESSAGES,
} from "./assignments.constants.js";
import {
  toPublicUserDto,
  toStudentAssignmentDetailDto,
  toSubmissionDto,
  toTeacherAssignmentDetailDto,
} from "./dto/assignment-response.dto.js";

const SOCKET_ROOM_PREFIXES = Object.freeze({
  USER: "user:",
  CLASS: "class:",
});

const getRoomName = (prefix, id) => `${prefix}${id}`;

const isUserSocketConnected = (io, userId) => {
  const room = io.sockets.adapter.rooms.get(
    getRoomName(SOCKET_ROOM_PREFIXES.USER, userId),
  );

  return Boolean(room?.size);
};

const notifyUsersWithFallback = async ({ io, userIds, senderId, payload }) => {
  const recipientIds = [...new Set(userIds.map(Number))].filter(
    (userId) => userId !== Number(senderId),
  );
  const connectedUserIds = [];
  const offlineUserIds = [];

  recipientIds.forEach((userId) => {
    if (isUserSocketConnected(io, userId)) {
      connectedUserIds.push(userId);
    } else {
      offlineUserIds.push(userId);
    }
  });

  connectedUserIds.forEach((userId) => {
    io.to(getRoomName(SOCKET_ROOM_PREFIXES.USER, userId)).emit(
      SOCKET_EVENTS.NOTIFICATION_RECEIVED,
      payload,
    );
  });

  if (offlineUserIds.length > 0) {
    await sendPushNotificationToUsers(offlineUserIds, payload);
  }

  return connectedUserIds;
};

const buildNotificationPayload = ({
  id,
  kind,
  title,
  content,
  assignmentId,
  submissionId,
  classId,
  classCode,
  grade,
}) => createSocketPayload(
  SOCKET_PAYLOAD_TYPES.NOTIFICATION,
  SOCKET_EVENTS.NOTIFICATION_RECEIVED,
  {
    id,
    title,
    content,
    notificationType: NOTIFICATION_CATEGORIES.ASSIGNMENT,
    notificationKind: kind,
    assignmentId: assignmentId?.toString(),
    submissionId: submissionId?.toString(),
    classId: classId?.toString(),
    classCode,
    grade,
  },
);

const emitSubmissionEventToConnectedUsers = (io, userIds, event, payload) => {
  userIds.forEach((userId) => {
    io.to(getRoomName(SOCKET_ROOM_PREFIXES.USER, userId)).emit(event, payload);
  });
};

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
    const assignmentPayload = createSocketPayload(SOCKET_PAYLOAD_TYPES.ASSIGNMENT, SOCKET_EVENTS.ASSIGNMENT_CREATED, {
      assignmentId: assignment.id.toString(),
      classId: assignment.classId.toString(),
      classCode: classData.code,
      action: ASSIGNMENT_ACTIONS.CREATED,
      type: ASSIGNMENT_NOTIFICATION_KINDS.NEW_ASSIGNMENT,
    });

    io.to(getRoomName(SOCKET_ROOM_PREFIXES.CLASS, classData.id)).emit(
      SOCKET_EVENTS.ASSIGNMENT_CREATED,
      assignmentPayload,
    );

    const recipientIds = classData.members
      .filter((member) => member.userId !== authorId)
      .map((member) => member.userId);
    const assignmentMessage = ASSIGNMENT_NOTIFICATION_MESSAGES.NEW_ASSIGNMENT({
      assignmentTitle: assignment.title,
    });
    const notificationPayload = buildNotificationPayload({
      id: `assignment-${assignment.id}-${Date.now()}`,
      kind: ASSIGNMENT_NOTIFICATION_KINDS.NEW_ASSIGNMENT,
      ...assignmentMessage,
      assignmentId: assignment.id,
      classId: classData.id,
      classCode: classData.code,
    });

    await notifyUsersWithFallback({
      io,
      userIds: recipientIds,
      senderId: authorId,
      payload: notificationPayload,
    });
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
    const submissionPayload = createSocketPayload(SOCKET_PAYLOAD_TYPES.SUBMISSION, SOCKET_EVENTS.SUBMISSION_CREATED, {
      submissionId: submission.id.toString(),
      assignmentId: postId.toString(),
      studentId: userId.toString(),
      status: submission.status,
      action: ASSIGNMENT_ACTIONS.CREATED,
    });

    const studentName = userInClass.name || `User ${userId}`;
    const submissionMessage = ASSIGNMENT_NOTIFICATION_MESSAGES.SUBMISSION_CREATED({
      studentName,
      assignmentTitle: assignment.title,
    });
    const notificationPayload = buildNotificationPayload({
      id: `submission-${submission.id}-${Date.now()}`,
      kind: ASSIGNMENT_NOTIFICATION_KINDS.SUBMISSION_CREATED,
      ...submissionMessage,
      assignmentId: postId,
      submissionId: submission.id,
      classId: assignment.classId,
      classCode: assignment.class.code,
    });

    const connectedUserIds = await notifyUsersWithFallback({
      io,
      userIds: [assignment.authorId],
      senderId: userId,
      payload: notificationPayload,
    });

    emitSubmissionEventToConnectedUsers(
      io,
      connectedUserIds,
      SOCKET_EVENTS.SUBMISSION_CREATED,
      submissionPayload,
    );
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
    const submissionPayload = createSocketPayload(SOCKET_PAYLOAD_TYPES.SUBMISSION, SOCKET_EVENTS.SUBMISSION_GRADED, {
      submissionId: submissionId.toString(),
      assignmentId: submission.postId.toString(),
      grade: data.grade,
      action: ASSIGNMENT_ACTIONS.GRADED,
    });

    const gradeMessage = ASSIGNMENT_NOTIFICATION_MESSAGES.SUBMISSION_GRADED({
      assignmentTitle: submission.post.title,
    });
    const notificationPayload = buildNotificationPayload({
      id: `grade-${submissionId}-${Date.now()}`,
      kind: ASSIGNMENT_NOTIFICATION_KINDS.SUBMISSION_GRADED,
      ...gradeMessage,
      assignmentId: submission.postId,
      submissionId,
      classId: submission.post.classId,
      classCode: submission.post.class.code,
      grade: data.grade,
    });

    const connectedUserIds = await notifyUsersWithFallback({
      io,
      userIds: [submission.studentId],
      senderId: teacherId,
      payload: notificationPayload,
    });

    emitSubmissionEventToConnectedUsers(
      io,
      connectedUserIds,
      SOCKET_EVENTS.SUBMISSION_GRADED,
      submissionPayload,
    );
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


