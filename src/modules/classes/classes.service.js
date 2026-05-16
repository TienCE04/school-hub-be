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

export const createClass = async (data) => {
  let code = data.code;
  if (!code) {
    code = await generateUniqueClassCode();
  } else {
    const exists = await prisma.class.findUnique({ where: { code } });
    if (exists) {
      throw new Error("Class code already exists");
    }
  }

  const { code: _code, ...restData } = data; // Remove code from data to avoid conflict if any

  const newClass = await repo.createClass({
    ...restData,
    code,
  });
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

  await repo.addClassMember(userId, classToJoin.id);

  return {
    message: "Successfully joined the class",
    classId: classToJoin.id,
  };
};
