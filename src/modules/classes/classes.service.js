import * as repo from "./classes.repository.js";
import prisma from "../../config/prisma.js";

export const getClassDetails = async (classId) => {
  const classData = await repo.findClassWithPosts(classId);
  if (!classData) throw new Error("Class not found");

  return {
    id: classData.id.toString(),
    name: classData.name,
    posts: classData.posts.map((post) => ({
      id: post.id,
      title: post.title,
      content: post.content,
      type: post.type,
      createdAt: post.createdAt,
      author: {
        name: post.author.name,
        email: post.author.email,
        role: post.author.role,
      },
      attachments: post.attachments,
    })),
  };
};

export const createPost = async (data, user) => {
  const classExists = await repo.findClassById(data.classId);
  if (!classExists) throw new Error("Class not found");
  if (data.type === "ASSIGNMENT" && !data.dueDate) {
    throw new Error("Due date is required for assignments");
  }

  if (data.type === "ASSIGNMENT" && user.role !== "TEACHER") {
    throw new Error("Only teacher can create assignment");
  }
  return repo.createPost(user.id, data);
};

export const getAssignmentStats = async (postId, classId) => {
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

export const getAssignments = async (classId, page, limit) => {
  const classExists = await repo.findClassById(classId);
  if (!classExists) throw new Error("Class not found");

  return repo.findAssignmentsByClass(classId, page, limit);
};
