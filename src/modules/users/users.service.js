import prisma from "../../config/prisma.js";

export const searchUsers = async (query) => {
  const users = await prisma.user.findMany({
    where: {
      OR: [
        { email: { contains: query, mode: "insensitive" } },
        { name: { contains: query, mode: "insensitive" } },
        { studentCode: { contains: query, mode: "insensitive" } },
      ],
    },
    select: {
      id: true,
      name: true,
      email: true,
      studentCode: true,
      role: true,
      avatar: true,
    },
    take: 20, // limit to 20 results
  });
  return users;
};

export const saveFcmToken = async (userId, token) => {
  // Check if token already exists
  const existingToken = await prisma.deviceToken.findUnique({
    where: { token }
  });

  if (existingToken) {
    if (existingToken.userId !== userId) {
      // Token exists but belongs to another user (e.g. user logged out and another logged in)
      // Update it to belong to the current user
      return prisma.deviceToken.update({
        where: { token },
        data: { userId }
      });
    }
    return existingToken;
  }

  // Create new token
  return prisma.deviceToken.create({
    data: {
      userId,
      token
    }
  });
};

export const deleteFcmToken = async (userId, token) => {
  return prisma.deviceToken.deleteMany({
    where: {
      userId,
      token
    }
  });
};
