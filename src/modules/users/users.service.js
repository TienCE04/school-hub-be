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
