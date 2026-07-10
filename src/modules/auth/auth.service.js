import bcrypt from "bcrypt";
import * as repo from "./auth.repository.js";
import {
  generateAccessToken,
  generateRefreshToken,
} from "../../shared/utils/jwt.js";
import { hashToken } from "../../shared/utils/hash.js";
import prisma from "../../config/prisma.js";

export const login = async ({ email, password }) => {
  const user = await repo.findUserByEmail(email);
  if (!user) throw new Error("User not found");

  const isMatch = await bcrypt.compare(password, user.password);
  if (!isMatch) throw new Error("Wrong password");

  const accessToken = generateAccessToken(user);
  const refreshToken = generateRefreshToken(user);

  const hashed = hashToken(refreshToken);

  await repo.saveRefreshToken(
    user.id,
    hashed,
    new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
  );

  const { password: _, ...safeUser } = user;

  return {
    accessToken,
    refreshToken,
    expiresIn: 900,
    user: safeUser,
  };
};

export const refresh = async (oldToken) => {
  const hashed = hashToken(oldToken);

  const tokenDoc = await repo.findRefreshToken(hashed);
  if (!tokenDoc) throw new Error("Invalid refresh token");

  if (tokenDoc.expiresAt < new Date()) {
    throw new Error("Token expired");
  }

  const user = await repo.findUserById(tokenDoc.userId);
  if (!user) throw new Error("User not found");

  const newAccessToken = generateAccessToken(user);
  const newRefreshToken = generateRefreshToken(user);

  // rotate token
  await repo.deleteRefreshToken(hashed);

  await repo.saveRefreshToken(
    user.id,
    hashToken(newRefreshToken),
    new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
  );

  return {
    accessToken: newAccessToken,
    refreshToken: newRefreshToken,
    expiresIn: 900,
  };
};
export const createUser = async (data) => {
  const existing = await repo.findUserByEmail(data.email);
  if (existing) throw new Error("Email already exists");

  const hashedPassword = await bcrypt.hash(data.password, 10);

  return repo.createUser({
    ...data,
    password: hashedPassword,
  });
};

export const changePassword = async (userId, { oldPassword, newPassword }) => {
  const user = await repo.findUserById(userId);
  if (!user) throw new Error("User not found");

  const isMatch = await bcrypt.compare(oldPassword, user.password);
  if (!isMatch) throw new Error("Old password incorrect");

  const hashed = await bcrypt.hash(newPassword, 10);

  await prisma.user.update({
    where: { id: userId },
    data: { password: hashed },
  });

  await prisma.refreshToken.deleteMany({
    where: { userId },
  });
};
