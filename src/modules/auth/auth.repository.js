import prisma from "../../config/prisma.js";

export const findUserByEmail = (email) => {
  return prisma.user.findUnique({ where: { email } });
};

export const findUserById = (id) => {
  return prisma.user.findUnique({ where: { id } });
};

export const saveRefreshToken = (userId, token, expiresAt) => {
  return prisma.refreshToken.create({
    data: {
      userId,
      token,
      expiresAt,
    },
  });
};

export const findRefreshToken = (token) => {
  return prisma.refreshToken.findUnique({
    where: { token },
  });
};

export const deleteRefreshToken = (token) => {
  return prisma.refreshToken.delete({
    where: { token },
  });
};
export const createUser = (data) => {
  return prisma.user.create({
    data,
  });
};
