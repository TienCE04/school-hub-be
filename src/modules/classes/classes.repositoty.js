import prisma from "../../config/prisma.js";

export const findClassWithPosts = (classId) => {
  return prisma.class.findUnique({
    where: { id: classId },
    include: {
      posts: {
        include: {
          author: true,
          attachments: true,
          comments: { include: { author: true, attachments: true } },
        },
      },
    },
  });
};

export const createClass = (data) => {
  return prisma.class.create({ data });
};

export const createPost = (authorId, data) => {
  const { classId, ...postData } = data;
  return prisma.post.create({
    data: {
      ...postData,
      authorId,
      classId,
    },
    include: { author: true, attachments: true },
  });
};

export const findClassById = (classId) => {
  return prisma.class.findUnique({
    where: { id: classId },
  });
};

export const findPostsByClass = async (classId, page = 1, limit = 10) => {
  const [data, total] = await Promise.all([
    prisma.post.findMany({
      where: { classId },
      skip: (page - 1) * limit,
      take: limit,
      orderBy: { createdAt: "desc" },
      include: {
        author: true,
        attachments: true,
      },
    }),
    prisma.post.count({
      where: { classId },
    }),
  ]);

  return {
    data,
    pagination: {
      page,
      limit,
      total,
    },
  };
};

export const findCommentsByPost = async (postId, page = 1, limit = 10) => {
  const [data, total] = await Promise.all([
    prisma.comment.findMany({
      where: { postId },
      skip: (page - 1) * limit,
      take: limit,
      orderBy: { createdAt: "asc" },
      include: {
        author: true,
        attachments: true,
      },
    }),
    prisma.comment.count({
      where: { postId },
    }),
  ]);

  return {
    data,
    pagination: {
      page,
      limit,
      total,
    },
  };
};
