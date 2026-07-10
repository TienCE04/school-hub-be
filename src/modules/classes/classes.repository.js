import prisma from "../../config/prisma.js";

export const findClassWithPosts = (classId) => {
  return prisma.class.findUnique({
    where: { id: classId },
    include: {
      posts: {
        orderBy: { createdAt: 'desc' },
        take: 20,
        include: {
          author: true,
          attachments: true,
          comments: { include: { author: true, attachments: true } },
          class: true,
        },
      },
    },
  });
};

export const createClass = (data) => {
  return prisma.class.create({ data });
};

export const createPost = (authorId, data) => {
  const { classId, attachments, ...postData } = data;
  return prisma.post.create({
    data: {
      ...postData,
      authorId,
      classId,
      attachments: attachments && attachments.length > 0 ? {
        create: attachments.map(att => ({
          name: typeof att === 'string' ? att.split('/').pop() : att.name || "Attachment",
          url: typeof att === 'string' ? att : att.url,
          mimeType: typeof att === 'string' ? "application/octet-stream" : att.mimeType || "application/octet-stream",
          size: typeof att === 'string' ? 0 : att.size || 0,
        }))
      } : undefined
    },
    include: { author: true, attachments: true, class: true },
  });
};

export const updatePost = (postId, data) => {
  const { attachments, ...postData } = data;
  return prisma.post.update({
    where: { id: postId },
    data: postData,
    include: { author: true, attachments: true, class: true },
  });
};

export const deletePost = (postId) => {
  return prisma.post.delete({
    where: { id: postId },
  });
};

export const findClassById = (classId) => {
  return prisma.class.findUnique({
    where: { id: classId },
  });
};

export const findPostById = (postId) => {
  return prisma.post.findUnique({
    where: { id: postId },
    include: {
      author: true,
      attachments: true,
      class: true,
      comments: { include: { author: true, attachments: true } },
    },
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

export const findAssignmentsByClass = async (classId, page = 1, limit = 10) => {
  const [data, total] = await Promise.all([
    prisma.post.findMany({
      where: {
        classId,
        type: "ASSIGNMENT",
      },
      skip: (page - 1) * limit,
      take: limit,
      orderBy: { createdAt: "desc" },
      include: {
        author: true,
        attachments: true,
      },
    }),
    prisma.post.count({
      where: {
        classId,
        type: "ASSIGNMENT",
      },
    }),
  ]);

  return {
    data,
    pagination: { page, limit, total },
  };
};

export const createComment = (authorId, postId, content, attachments) => {
  return prisma.comment.create({
    data: {
      content,
      authorId,
      postId,
      attachments: attachments && attachments.length > 0 ? {
        create: attachments.map(att => ({
          name: typeof att === 'string' ? att.split('/').pop() : att.name || "Attachment",
          url: typeof att === 'string' ? att : att.url,
          mimeType: typeof att === 'string' ? "application/octet-stream" : att.mimeType || "application/octet-stream",
          size: typeof att === 'string' ? 0 : att.size || 0,
        }))
      } : undefined
    },
    include: { author: true, attachments: true, post: { include: { class: true } } },
  });
};

export const findCommentById = (commentId) => {
  return prisma.comment.findUnique({
    where: { id: commentId },
    include: { post: { include: { class: true } }, author: true }
  });
};

export const deleteComment = (commentId) => {
  return prisma.comment.delete({
    where: { id: commentId }
  });
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

export const findClassMembers = (classId) => {
  return prisma.classMember.findMany({
    where: { classId },
    include: {
      user: {
        select: {
          id: true,
          name: true,
          email: true,
          avatar: true,
          role: true,
        },
      },
    },
    orderBy: {
      joinedAt: "asc",
    },
  });
};

export const findClassesByUserId = (userId) => {
  return prisma.classMember.findMany({
    where: { userId },
    include: {
      class: {
        include: {
          members: {
            select: { id: true }
          }
        }
      }
    },
    orderBy: {
      joinedAt: "desc"
    }
  });
};

export const findClassByCode = (code) => {
  return prisma.class.findUnique({
    where: { code },
  });
};

export const checkClassMembership = async (userId, classId) => {
  const member = await prisma.classMember.findUnique({
    where: {
      userId_classId: { userId, classId },
    },
  });
  return !!member;
};

export const addClassMember = (userId, classId) => {
  return prisma.classMember.create({
    data: {
      userId,
      classId,
    },
  });
};

export const createJoinRequest = (userId, classId) => {
  return prisma.classJoinRequest.create({
    data: {
      userId,
      classId,
      status: "PENDING"
    }
  });
};

export const findJoinRequest = (userId, classId) => {
  return prisma.classJoinRequest.findUnique({
    where: {
      userId_classId: { userId, classId }
    }
  });
};

export const findJoinRequestById = (id) => {
  return prisma.classJoinRequest.findUnique({
    where: { id }
  });
}

export const findJoinRequestsByClass = (classId) => {
  return prisma.classJoinRequest.findMany({
    where: {
      classId,
      status: "PENDING"
    },
    include: {
      user: {
        select: {
          id: true,
          name: true,
          email: true,
          avatar: true,
          role: true,
        }
      }
    },
    orderBy: { createdAt: "desc" }
  });
};

export const updateJoinRequestStatus = (id, status) => {
  return prisma.classJoinRequest.update({
    where: { id },
    data: { status }
  });
};
