import prisma from "../../config/prisma.js";

const publicUserSelect = {
  id: true,
  name: true,
  email: true,
  studentCode: true,
  avatar: true,
  role: true,
};

export const findClassWithPosts = (classId) => {
  return prisma.class.findUnique({
    where: { id: classId },
    include: {
      posts: {
        orderBy: { createdAt: 'desc' },
        take: 20,
        include: {
          author: { select: publicUserSelect },
          attachments: true,
          comments: { include: { author: { select: publicUserSelect }, attachments: true } },
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
    include: { author: { select: publicUserSelect }, attachments: true, class: true },
  });
};

export const updatePost = (postId, data) => {
  const { attachments, ...postData } = data;
  return prisma.post.update({
    where: { id: postId },
    data: postData,
    include: { author: { select: publicUserSelect }, attachments: true, class: true },
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

export const findClassForAdmin = (classId) => {
  return prisma.class.findUnique({
    where: { id: classId },
    include: {
      subject: { select: { id: true, title: true, subjectCode: true, semesterId: true } },
      _count: { select: { members: true, posts: true } },
    },
  });
};

export const findAllClasses = async (page = 1, limit = 20, search = "") => {
  const normalizedSearch = String(search || "").trim();
  const where = normalizedSearch
    ? {
        OR: [
          { name: { contains: normalizedSearch, mode: "insensitive" } },
          { code: { contains: normalizedSearch, mode: "insensitive" } },
        ],
      }
    : {};
  const skip = (page - 1) * limit;
  const [classes, total] = await Promise.all([
    prisma.class.findMany({
      where,
      skip,
      take: limit,
      orderBy: { createdAt: "desc" },
      include: {
        members: {
          where: { user: { is: { role: "TEACHER" } } },
          include: { user: { select: publicUserSelect } },
          orderBy: { joinedAt: "asc" },
        },
        subject: { select: { id: true, title: true, subjectCode: true, semesterId: true } },
        _count: { select: { members: true, posts: true } },
      },
    }),
    prisma.class.count({ where }),
  ]);
  return { classes, total };
};

export const updateClass = (classId, data) => {
  return prisma.class.update({ where: { id: classId }, data });
};

export const deleteClass = async (classId) => {
  return prisma.$transaction(async (tx) => {
    const classObj = await tx.class.findUnique({
      where: { id: classId },
      include: {
        posts: {
          select: {
            id: true,
            comments: { select: { id: true } },
            submissions: { select: { id: true } },
          },
        },
        attendanceSessions: { select: { id: true } },
      },
    });
    if (!classObj) throw new Error("Class not found");
    if (classObj.attendanceSessions.length > 0) {
      throw new Error("Cannot delete a class with attendance sessions");
    }

    const postIds = classObj.posts.map((post) => post.id);
    const commentIds = classObj.posts.flatMap((post) => post.comments.map((comment) => comment.id));
    const submissionIds = classObj.posts.flatMap((post) => post.submissions.map((submission) => submission.id));
    if (postIds.length > 0) {
      const attachmentFilters = [{ postId: { in: postIds } }];
      if (commentIds.length > 0) attachmentFilters.push({ commentId: { in: commentIds } });
      if (submissionIds.length > 0) attachmentFilters.push({ submissionId: { in: submissionIds } });
      await tx.attachment.deleteMany({ where: { OR: attachmentFilters } });
      await tx.comment.deleteMany({ where: { postId: { in: postIds } } });
      await tx.submission.deleteMany({ where: { postId: { in: postIds } } });
      await tx.post.deleteMany({ where: { id: { in: postIds } } });
    }

    await tx.subject.updateMany({ where: { classId }, data: { classId: null } });
    await tx.class.delete({ where: { id: classId } });
    return classObj;
  });
};

export const getClassMembersPage = async (classId, page, limit, search) => {
  const normalizedSearch = String(search || "").trim();
  const where = {
    classId,
    ...(normalizedSearch ? {
      user: {
        is: {
          OR: [
            { name: { contains: normalizedSearch, mode: "insensitive" } },
            { email: { contains: normalizedSearch, mode: "insensitive" } },
            { studentCode: { contains: normalizedSearch, mode: "insensitive" } },
          ],
        },
      },
    } : {}),
  };
  const [members, total] = await Promise.all([
    prisma.classMember.findMany({
      where,
      skip: (page - 1) * limit,
      take: limit,
      orderBy: [{ joinedAt: "desc" }, { id: "desc" }],
      include: { user: { select: publicUserSelect } },
    }),
    prisma.classMember.count({ where }),
  ]);
  return { members: members.map((member) => ({ ...member.user, joinedAt: member.joinedAt })), total };
};

export const getClassRosterPage = async (classId, page, limit, search) => {
  const normalizedSearch = String(search || "").trim();
  const studentWhere = {
    classId,
    user: {
      is: {
        role: "STUDENT",
        ...(normalizedSearch ? {
          OR: [
            { name: { contains: normalizedSearch, mode: "insensitive" } },
            { email: { contains: normalizedSearch, mode: "insensitive" } },
            { studentCode: { contains: normalizedSearch, mode: "insensitive" } },
          ],
        } : {}),
      },
    },
  };
  const [students, total, teachers] = await Promise.all([
    prisma.classMember.findMany({
      where: studentWhere,
      skip: (page - 1) * limit,
      take: limit,
      orderBy: [{ user: { name: "asc" } }, { id: "asc" }],
      include: { user: { select: publicUserSelect } },
    }),
    prisma.classMember.count({ where: studentWhere }),
    prisma.classMember.findMany({
      where: { classId, user: { is: { role: { in: ["TEACHER", "ADMIN"] } } } },
      orderBy: { joinedAt: "asc" },
      include: { user: { select: publicUserSelect } },
    }),
  ]);
  const toMember = (member) => ({ ...member.user, joinedAt: member.joinedAt });
  return { students: students.map(toMember), teachers: teachers.map(toMember), total };
};

export const findAvailableClassStudents = (classId, search) => prisma.user.findMany({
  where: {
    role: "STUDENT",
    classMembers: { none: { classId } },
    OR: [
      { name: { contains: search, mode: "insensitive" } },
      { email: { contains: search, mode: "insensitive" } },
      { studentCode: { contains: search, mode: "insensitive" } },
    ],
  },
  select: publicUserSelect,
  orderBy: { name: "asc" },
  take: 15,
});

export const findPostById = (postId) => {
  return prisma.post.findUnique({
    where: { id: postId },
    include: {
      author: { select: publicUserSelect },
      attachments: true,
      class: true,
      comments: { include: { author: { select: publicUserSelect }, attachments: true } },
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
        author: { select: publicUserSelect },
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
        author: { select: publicUserSelect },
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
    include: { author: { select: publicUserSelect }, attachments: true, post: { include: { class: true } } },
  });
};

export const findCommentById = (commentId) => {
  return prisma.comment.findUnique({
    where: { id: commentId },
    include: { post: { include: { class: true } }, author: { select: publicUserSelect } }
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
          studentCode: true,
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
