import * as repo from "./classes.repository.js";
import prisma from "../../config/prisma.js";
import { getIO } from "../../realtime/gateway/index.js";
import { SOCKET_EVENTS } from "../../realtime/events/index.js";
import { createSocketPayload } from "../../realtime/events/payload.js";
import { sendPushNotification, sendPushNotificationToUsers } from "../../shared/utils/fcm.js";

const getClassMember = (userId, classId) => prisma.classMember.findUnique({
  where: { userId_classId: { userId, classId } },
  include: { user: true },
});

const assertClassMember = async (user, classId) => {
  if (user.role === "ADMIN") return null;

  const member = await getClassMember(user.id, classId);
  if (!member) throw new Error("You are not a member of this class");
  return member;
};

const assertClassTeacher = async (user, classId) => {
  if (user.role === "ADMIN") return null;

  const member = await getClassMember(user.id, classId);
  if (!member || member.user.role !== "TEACHER") {
    throw new Error("Only a class teacher or admin can perform this action");
  }
  return member;
};

export const getClassDetails = async (classCode, user) => {
  const classObj = await repo.findClassByCode(classCode);
  if (!classObj) throw new Error("Class not found");
  await assertClassMember(user, classObj.id);
  const classData = await repo.findClassWithPosts(classObj.id);
  if (!classData) throw new Error("Class details not found");

  return {
    id: classData.id.toString(),
    name: classData.name,
    posts: classData.posts.map((post) => ({
      id: post.id,
      title: post.title,
      content: post.content,
      type: post.type,
      createdAt: post.createdAt,
      updatedAt: post.updatedAt,
      author: {
        id: post.author.id,
        name: post.author.name,
        avatar: post.author.avatar || "",
        email: post.author.email,
        role: post.author.role,
      },
      attachments: post.attachments,
      comments: post.comments || [],
    })),
  };
};

export const getPostById = async (postId, userId) => {
  const post = await repo.findPostById(postId);
  if (!post) throw new Error("Post not found");

  const isMember = await repo.checkClassMembership(userId, post.classId);
  if (!isMember) {
    throw new Error("You are not a member of this class");
  }

  return {
    id: post.id,
    title: post.title,
    content: post.content,
    type: post.type,
    createdAt: post.createdAt,
    updatedAt: post.updatedAt,
    dueDate: post.dueDate,
    classId: post.classId,
    author: {
      id: post.author.id,
      name: post.author.name,
      avatar: post.author.avatar || "",
      email: post.author.email,
      role: post.author.role,
    },
    attachments: post.attachments,
    comments: post.comments || [],
  };
};

export const createPost = async (data, user) => {
  const classExists = await repo.findClassByCode(data.classCode);
  if (!classExists) throw new Error("Class not found");
  await assertClassMember(user, classExists.id);
  if (!["ANNOUNCEMENT", "ASSIGNMENT"].includes(data.type)) {
    throw new Error("Invalid post type");
  }
  if (data.type === "ASSIGNMENT" && !data.dueDate) {
    throw new Error("Due date is required for assignments");
  }

  if (data.type === "ASSIGNMENT" && !["TEACHER", "ADMIN"].includes(user.role)) {
    throw new Error("Only a teacher or admin can create an assignment");
  }

  const postData = { ...data, classId: classExists.id };
  delete postData.classCode;

  const post = await repo.createPost(user.id, postData);

  try {
    const io = getIO();
    const isAssignment = post.type === "ASSIGNMENT";
    const eventName = isAssignment ? SOCKET_EVENTS.ASSIGNMENT_CREATED : SOCKET_EVENTS.POST_CREATED;
    const payload = createSocketPayload(isAssignment ? "assignment" : "post", eventName, {
        postId: isAssignment ? undefined : post.id.toString(),
        assignmentId: isAssignment ? post.id.toString() : undefined,
        classId: classExists.id.toString(),
        classCode: classExists.code,
        action: "created",
        type: isAssignment ? "NEW_ASSIGNMENT" : "NEW_POST"
    });

    io.to(`class:${classExists.id}`).emit(eventName, payload);

    // Send FCM to all members
    const members = await prisma.classMember.findMany({ where: { classId: classExists.id } });
    const userIds = members.filter(m => m.userId !== user.id).map(m => m.userId);
    if (userIds.length > 0) {
      sendPushNotificationToUsers(userIds, payload);
    }
  } catch (err) {
    console.error("Socket error on createPost:", err);
  }

  return post;
};

export const updatePost = async (postId, data, user) => {
  const post = await repo.findPostById(postId);
  if (!post) throw new Error("Post not found");
  await assertClassMember(user, post.classId);

  if (post.authorId !== user.id && user.role !== "ADMIN") {
    throw new Error("Permission denied to update this post");
  }

  const updateData = {};
  if (data.title !== undefined) {
    if (!data.title?.trim()) throw new Error("Title is required");
    updateData.title = data.title.trim();
  }
  if (data.content !== undefined) {
    if (!data.content?.trim()) throw new Error("Content is required");
    updateData.content = data.content.trim();
  }
  if (data.type !== undefined) {
    if (!["ANNOUNCEMENT", "ASSIGNMENT"].includes(data.type)) {
      throw new Error("Invalid post type");
    }
    if (data.type !== post.type) {
      throw new Error("Post type cannot be changed");
    }
    updateData.type = data.type;
  }
  if (data.dueDate !== undefined) {
    const parsedDueDate = data.dueDate ? new Date(data.dueDate) : null;
    if (parsedDueDate && Number.isNaN(parsedDueDate.getTime())) {
      throw new Error("Invalid dueDate");
    }
    updateData.dueDate = parsedDueDate;
  }
  if (post.type === "ASSIGNMENT" && !["TEACHER", "ADMIN"].includes(user.role)) {
    throw new Error("Only a teacher or admin can update an assignment");
  }

  const updatedPost = await repo.updatePost(postId, updateData);

  try {
    const io = getIO();
    const eventName = post.type === "ASSIGNMENT" ? SOCKET_EVENTS.ASSIGNMENT_UPDATED : SOCKET_EVENTS.POST_UPDATED;
    const payload = createSocketPayload(post.type === "ASSIGNMENT" ? "assignment" : "post", eventName, {
        postId: updatedPost.id.toString(),
        assignmentId: post.type === "ASSIGNMENT" ? updatedPost.id.toString() : undefined,
        classId: updatedPost.classId.toString(),
        classCode: updatedPost.class.code,
        action: "updated",
        type: post.type === "ASSIGNMENT" ? "UPDATE_ASSIGNMENT" : "UPDATE_POST"
    });
    io.to(`class:${updatedPost.classId}`).emit(eventName, payload);
    // Not sending FCM for updates unless requested, typically updates are silent
  } catch (err) {
    console.error("Socket error on updatePost:", err);
  }

  return updatedPost;
};

export const deletePost = async (postId, user) => {
  const post = await repo.findPostById(postId);
  if (!post) throw new Error("Post not found");
  await assertClassMember(user, post.classId);

  if (post.authorId !== user.id && user.role !== "ADMIN") {
    throw new Error("Permission denied to delete this post");
  }

  await repo.deletePost(postId);

  try {
    const io = getIO();
    const eventName = post.type === "ASSIGNMENT" ? SOCKET_EVENTS.ASSIGNMENT_DELETED : SOCKET_EVENTS.POST_DELETED;
    const payload = createSocketPayload(post.type === "ASSIGNMENT" ? "assignment" : "post", eventName, {
        postId: postId.toString(),
        assignmentId: post.type === "ASSIGNMENT" ? postId.toString() : undefined,
        classId: post.classId.toString(),
        classCode: post.class.code,
        action: "deleted",
        type: post.type === "ASSIGNMENT" ? "DELETE_ASSIGNMENT" : "DELETE_POST"
    });
    io.to(`class:${post.classId}`).emit(eventName, payload);
  } catch (err) {
    console.error("Socket error on deletePost:", err);
  }

  return { message: "Post deleted successfully" };
};

export const createComment = async (postId, user, content, attachments) => {
  const post = await repo.findPostById(postId);
  if (!post) throw new Error("Post not found");

  const isMember = await repo.checkClassMembership(user.id, post.classId);
  if (!isMember) throw new Error("You are not a member of this class");

  const comment = await repo.createComment(user.id, postId, content, attachments);

  try {
    const io = getIO();
    const payload = createSocketPayload("comment", SOCKET_EVENTS.COMMENT_ADDED, {
        commentId: comment.id.toString(),
        postId: postId.toString(),
        classId: post.classId.toString(),
        classCode: comment.post.class.code,
        action: "created",
    });
    io.to(`class:${post.classId}`).emit(SOCKET_EVENTS.COMMENT_ADDED, payload);
  } catch (err) {
    console.error("Socket error on createComment:", err);
  }

  return comment;
};

export const deleteComment = async (commentId, user) => {
  const comment = await repo.findCommentById(commentId);
  if (!comment) throw new Error("Comment not found");
  await assertClassMember(user, comment.post.classId);

  if (comment.authorId !== user.id && user.role !== "ADMIN") {
    throw new Error("Permission denied to delete this comment");
  }

  await repo.deleteComment(commentId);

  try {
    const io = getIO();
    const payload = createSocketPayload("comment", SOCKET_EVENTS.COMMENT_DELETED, {
        commentId: commentId.toString(),
        postId: comment.postId.toString(),
        classId: comment.post.classId.toString(),
        classCode: comment.post.class.code,
        action: "deleted",
    });
    io.to(`class:${comment.post.classId}`).emit(SOCKET_EVENTS.COMMENT_DELETED, payload);
  } catch (err) {
    console.error("Socket error on deleteComment:", err);
  }

  return { message: "Comment deleted successfully" };
};

export const getAssignmentStats = async (postId, classCode, user) => {
  const classObj = await repo.findClassByCode(classCode);
  if (!classObj) throw new Error("Class not found");
  const classId = classObj.id;
  await assertClassTeacher(user, classId);

  const post = await prisma.post.findFirst({ where: { id: postId, classId, type: "ASSIGNMENT" } });
  if (!post) throw new Error("Assignment not found in this class");

  const [totalStudents, submittedCount, lateCount] = await Promise.all([
    prisma.classMember.count({
      where: { classId, user: { role: "STUDENT" } },
    }),
    prisma.submission.count({
      where: { postId, status: { in: ["SUBMITTED", "LATE", "GRADED"] } },
    }),
    prisma.submission.count({
      where: { postId, status: "LATE" },
    }),
  ]);

  return {
    totalStudents,
    submittedCount,
    notSubmittedCount: Math.max(0, totalStudents - submittedCount),
    lateCount,
  };
};

export const getAssignments = async (classCode, page, limit, user) => {
  const classExists = await repo.findClassByCode(classCode);
  if (!classExists) throw new Error("Class not found");
  await assertClassMember(user, classExists.id);

  return repo.findAssignmentsByClass(classExists.id, page, limit);
};

export const createClass = async (data, user) => {
  let code = data.code;
  if (!code) {
    code = await generateUniqueClassCode();
  } else {
    const exists = await prisma.class.findUnique({ where: { code } });
    if (exists) {
      throw new Error("Class code already exists");
    }
  }

  // Find if there is a Subject with this classCode
  const subject = await prisma.subject.findFirst({
    where: { classCode: code },
    include: { members: true }
  });

  if (subject && subject.classId) {
    throw new Error("This subject already has an associated class");
  }

  const { code: _code, ...restData } = data; // Remove code from data to avoid conflict if any

  // Prepare members for the Class
  // Automatically add the creator (user) and all Subject members to the Class
  const membersToCreate = [];
  if (user) {
    membersToCreate.push({ userId: user.id });
  }
  if (subject && subject.members) {
    subject.members.forEach((m) => {
      if (!user || m.userId !== user.id) {
        membersToCreate.push({ userId: m.userId });
      }
    });
  }

  const newClass = await prisma.class.create({
    data: {
      ...restData,
      code,
      members: membersToCreate.length > 0 ? {
        create: membersToCreate
      } : undefined
    }
  });

  // If there is a matching Subject, link the Subject to the newly created Class
  if (subject) {
    await prisma.subject.update({
      where: { id: subject.id },
      data: { classId: newClass.id }
    });
  }

  return newClass;
};

const generateUniqueClassCode = async () => {
  let code;
  let exists = true;

  while (exists) {
    code = Math.floor(100000 + Math.random() * 900000).toString();

    const found = await prisma.class.findUnique({
      where: { code },
    });

    if (!found) exists = false;
  }

  return code;
};

export const getClassMembers = async (classCode, user) => {
  const classExists = await repo.findClassByCode(classCode);
  if (!classExists) throw new Error("Class not found");
  await assertClassMember(user, classExists.id);

  const members = await repo.findClassMembers(classExists.id);

  return members.map((m) => ({
    id: m.user.id,
    name: m.user.name,
    email: m.user.email,
    avatar: m.user.avatar,
    role: m.user.role,
    joinedAt: m.joinedAt,
  }));
};

export const getMyClasses = async (userId) => {
  const memberships = await repo.findClassesByUserId(userId);
  return memberships.map((m) => {
    const { members, ...classData } = m.class;
    return {
      ...classData,
      membersCount: members ? members.length : 0,
      joinedAt: m.joinedAt,
    };
  });
};

export const joinClassByCode = async (userId, code) => {
  const classToJoin = await repo.findClassByCode(code);
  if (!classToJoin) {
    throw new Error("Class not found with the provided code");
  }

  const isMember = await repo.checkClassMembership(userId, classToJoin.id);
  if (isMember) {
    throw new Error("You are already a member of this class");
  }

  const existingReq = await repo.findJoinRequest(userId, classToJoin.id);
  if (existingReq && existingReq.status === "PENDING") {
    throw new Error("You already have a pending request for this class");
  }

  await repo.createJoinRequest(userId, classToJoin.id);

  try {
    const io = getIO();
    io.to(`class:${classToJoin.id}`).emit(SOCKET_EVENTS.CLASS_JOIN_REQUESTED, createSocketPayload("class", SOCKET_EVENTS.CLASS_JOIN_REQUESTED, {
      classId: classToJoin.id,
      userId,
      action: "requested",
    }));
  } catch (err) {
    console.error("Socket error on joinClassByCode:", err);
  }

  return {
    message: "Successfully sent join request. Please wait for approval.",
    classId: classToJoin.id,
  };
};

export const getJoinRequests = async (user, classCode) => {
  const classObj = await repo.findClassByCode(classCode);
  if (!classObj) throw new Error("Class not found");

  await assertClassTeacher(user, classObj.id);

  return await repo.findJoinRequestsByClass(classObj.id);
};

export const handleJoinRequest = async (user, classCode, requestId, status) => {
  const classObj = await repo.findClassByCode(classCode);
  if (!classObj) throw new Error("Class not found");

  await assertClassTeacher(user, classObj.id);

  const joinReq = await repo.findJoinRequestById(requestId);
  if (!joinReq || joinReq.classId !== classObj.id) {
    throw new Error("Join request not found");
  }

  if (joinReq.status !== "PENDING") {
    throw new Error("Join request is already handled");
  }

  if (status !== "APPROVED" && status !== "REJECTED") {
    throw new Error("Invalid status");
  }

  await repo.updateJoinRequestStatus(requestId, status);

  if (status === "APPROVED") {
    const isMember = await repo.checkClassMembership(joinReq.userId, classObj.id);
    if (!isMember) {
      await repo.addClassMember(joinReq.userId, classObj.id);

      try {
        const io = getIO();
        io.to(`class:${classObj.id}`).emit(SOCKET_EVENTS.MEMBER_ADDED, createSocketPayload("class", SOCKET_EVENTS.MEMBER_ADDED, {
          classId: classObj.id,
          userId: joinReq.userId,
          action: "member_added",
        }));
        io.to(`user:${joinReq.userId}`).emit(SOCKET_EVENTS.CLASS_JOIN_APPROVED, createSocketPayload("class", SOCKET_EVENTS.CLASS_JOIN_APPROVED, {
          classId: classObj.id,
          action: "approved",
        }));
      } catch (err) {
        console.error("Socket error on member added:", err);
      }
    }
  } else if (status === "REJECTED") {
    try {
      const io = getIO();
      io.to(`user:${joinReq.userId}`).emit(SOCKET_EVENTS.CLASS_JOIN_REJECTED, createSocketPayload("class", SOCKET_EVENTS.CLASS_JOIN_REJECTED, {
        classId: classObj.id,
        action: "rejected",
      }));
    } catch (err) {
      console.error("Socket error on request rejected:", err);
    }
  }

  return { message: `Request has been ${status.toLowerCase()}` };
};
