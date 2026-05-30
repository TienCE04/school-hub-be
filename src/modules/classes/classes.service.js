import * as repo from "./classes.repository.js";
import prisma from "../../config/prisma.js";
import { getIO } from "../../realtime/gateway/index.js";
import { SOCKET_EVENTS } from "../../realtime/events/index.js";

export const getClassDetails = async (classCode) => {
  const classObj = await repo.findClassByCode(classCode);
  if (!classObj) throw new Error("Class not found");
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
  if (data.type === "ASSIGNMENT" && !data.dueDate) {
    throw new Error("Due date is required for assignments");
  }

  if (data.type === "ASSIGNMENT" && user.role !== "TEACHER") {
    throw new Error("Only teacher can create assignment");
  }

  const postData = { ...data, classId: classExists.id };
  delete postData.classCode;

  const post = await repo.createPost(user.id, postData);

  try {
    const io = getIO();
    io.to(`class:${data.classId}`).emit(SOCKET_EVENTS.POST_CREATED, {
      type: "post",
      data: {
        postId: post.id.toString(),
        groupId: post.classId.toString(),
        type: "NEW_POST"
      }
    });
  } catch (err) {
    console.error("Socket error on createPost:", err);
  }

  return post;
};

export const getAssignmentStats = async (postId, classCode) => {
  const classObj = await repo.findClassByCode(classCode);
  if (!classObj) throw new Error("Class not found");
  const classId = classObj.id;

  const [totalStudents, submittedCount, lateCount] = await Promise.all([
    prisma.user.count({
      where: { role: "STUDENT", classId },
    }),
    prisma.submission.count({
      where: { postId, status: "SUBMITTED" },
    }),
    prisma.submission.count({
      where: { postId, status: "LATE" },
    }),
  ]);

  return {
    totalStudents,
    submittedCount,
    notSubmittedCount: totalStudents - submittedCount - lateCount,
    lateCount,
  };
};

export const getAssignments = async (classCode, page, limit) => {
  const classExists = await repo.findClassByCode(classCode);
  if (!classExists) throw new Error("Class not found");

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

export const getClassMembers = async (classCode) => {
  const classExists = await repo.findClassByCode(classCode);
  if (!classExists) throw new Error("Class not found");

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
    io.to(`class:${classToJoin.id}`).emit(SOCKET_EVENTS.CLASS_JOIN_REQUESTED, {
      classId: classToJoin.id,
      userId,
    });
  } catch (err) {
    console.error("Socket error on joinClassByCode:", err);
  }

  return {
    message: "Successfully sent join request. Please wait for approval.",
    classId: classToJoin.id,
  };
};

export const getJoinRequests = async (teacherId, classCode) => {
  const classObj = await repo.findClassByCode(classCode);
  if (!classObj) throw new Error("Class not found");

  const isTeacherMember = await repo.checkClassMembership(teacherId, classObj.id);
  if (!isTeacherMember) throw new Error("You do not have permission to view requests");

  return await repo.findJoinRequestsByClass(classObj.id);
};

export const handleJoinRequest = async (teacherId, classCode, requestId, status) => {
  const classObj = await repo.findClassByCode(classCode);
  if (!classObj) throw new Error("Class not found");

  const isTeacherMember = await repo.checkClassMembership(teacherId, classObj.id);
  if (!isTeacherMember) throw new Error("You do not have permission to handle requests");

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
        io.to(`class:${classObj.id}`).emit(SOCKET_EVENTS.MEMBER_ADDED, {
          classId: classObj.id,
          userId: joinReq.userId,
        });
        io.to(`user:${joinReq.userId}`).emit(SOCKET_EVENTS.CLASS_JOIN_APPROVED, {
          classId: classObj.id,
        });
      } catch (err) {
        console.error("Socket error on member added:", err);
      }
    }
  } else if (status === "REJECTED") {
    try {
      const io = getIO();
      io.to(`user:${joinReq.userId}`).emit(SOCKET_EVENTS.CLASS_JOIN_REJECTED, {
        classId: classObj.id,
      });
    } catch (err) {
      console.error("Socket error on request rejected:", err);
    }
  }

  return { message: `Request has been ${status.toLowerCase()}` };
};
