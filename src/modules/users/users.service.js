import prisma from "../../config/prisma.js";
import bcrypt from "bcrypt";

const profileFields = ["phone", "birthDate", "story", "emailPersonal", "nameSchool", "nameClass", "major", "department", "title"];
const normalizeProfile = (profile = {}) => Object.fromEntries(
  profileFields
    .filter((field) => profile[field] !== undefined)
    .map((field) => [field, profile[field] === null || String(profile[field]).trim() === "" ? null : String(profile[field]).trim()]),
);

export const searchUsers = async (query) => {
  const normalizedQuery = String(query || "").trim();
  if (!normalizedQuery) return [];

  const users = await prisma.user.findMany({
    where: {
      OR: [
        { email: { contains: normalizedQuery, mode: "insensitive" } },
        { name: { contains: normalizedQuery, mode: "insensitive" } },
        { studentCode: { contains: normalizedQuery, mode: "insensitive" } },
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

export const getAllUsers = async (page = 1, limit = 20, role, search) => {
  const safePage = Math.max(1, Number(page) || 1);
  const safeLimit = Math.min(100, Math.max(1, Number(limit) || 20));
  const normalizedSearch = String(search || "").trim();
  const where = {
    ...(role ? { role } : {}),
    ...(normalizedSearch
      ? {
          OR: [
            { email: { contains: normalizedSearch, mode: "insensitive" } },
            { name: { contains: normalizedSearch, mode: "insensitive" } },
            { studentCode: { contains: normalizedSearch, mode: "insensitive" } },
          ],
        }
      : {}),
  };
  const skip = (safePage - 1) * safeLimit;

  const [users, total] = await Promise.all([
    prisma.user.findMany({
      where,
      skip,
      take: safeLimit,
      select: {
        id: true,
        name: true,
        email: true,
        studentCode: true,
        role: true,
        avatar: true,
        createdAt: true,
        profile: { select: { phone: true, birthDate: true, emailPersonal: true, nameSchool: true, nameClass: true, major: true, department: true, title: true, story: true } },
      },
      orderBy: { createdAt: "desc" },
    }),
    prisma.user.count({ where }),
  ]);

  return { users, total, page: safePage, limit: safeLimit, totalPages: Math.ceil(total / safeLimit) };
};

export const createUser = async (data) => {
  const name = String(data.name || "").trim();
  const email = String(data.email || "").trim().toLowerCase();
  const password = String(data.password || "");
  const role = data.role || "STUDENT";
  const studentCode = data.studentCode === undefined ? null : String(data.studentCode).trim() || null;
  if (!name || !email || password.length < 6) throw new Error("Name, email and a password of at least 6 characters are required");
  if (!email.includes("@")) throw new Error("Invalid email address");
  if (!["ADMIN", "TEACHER", "STUDENT"].includes(role)) throw new Error("Invalid role");
  if (role === "STUDENT" && !studentCode) throw new Error("Student code is required for students");
  if (data.profile !== undefined && (!data.profile || typeof data.profile !== "object" || Array.isArray(data.profile))) {
    throw new Error("profile must be an object");
  }

  const profile = normalizeProfile(data.profile);
  const hashedPassword = await bcrypt.hash(password, 10);
  return prisma.user.create({
    data: {
      name,
      email,
      password: hashedPassword,
      role,
      studentCode: role === "STUDENT" ? studentCode : null,
      ...(Object.keys(profile).length > 0 ? { profile: { create: profile } } : {}),
    },
    select: {
      id: true, name: true, email: true, studentCode: true, role: true, avatar: true,
      profile: { select: { phone: true, birthDate: true, emailPersonal: true, nameSchool: true, nameClass: true, major: true, department: true, title: true, story: true } },
    },
  });
};

export const getUserById = async (id) => {
  const user = await prisma.user.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      email: true,
      studentCode: true,
      role: true,
      avatar: true,
      createdAt: true,
      profile: { select: { phone: true, birthDate: true, emailPersonal: true, nameSchool: true, nameClass: true, major: true, department: true, title: true, story: true } },
    }
  });
  if (!user) throw new Error("User not found");
  return user;
};

export const updateUser = async (id, data, actorId) => {
  const user = await prisma.user.findUnique({ where: { id } });
  if (!user) throw new Error("User not found");

  if (id === actorId && data.role && data.role !== "ADMIN") {
    throw new Error("You cannot remove your own admin role");
  }

  const updateData = {};
  if (data.name !== undefined) {
    const name = String(data.name).trim();
    if (!name) throw new Error("Name is required");
    updateData.name = name;
  }
  if (data.email !== undefined) {
    const email = String(data.email).trim().toLowerCase();
    if (!email) throw new Error("Email is required");
    updateData.email = email;
  }
  if (data.role !== undefined) {
    if (!["ADMIN", "TEACHER", "STUDENT"].includes(data.role)) {
      throw new Error("Invalid role");
    }
    updateData.role = data.role;
  }
  if (data.studentCode !== undefined) {
    const studentCode = data.studentCode === null ? null : String(data.studentCode).trim();
    const resultingRole = updateData.role || user.role;
    if (resultingRole === "STUDENT" && !studentCode) {
      throw new Error("Student code is required for students");
    }
    updateData.studentCode = studentCode || null;
  } else if (updateData.role === "STUDENT" && !user.studentCode) {
    throw new Error("Student code is required for students");
  } else if (updateData.role && updateData.role !== "STUDENT") {
    updateData.studentCode = null;
  }

  if (data.profile !== undefined && (!data.profile || typeof data.profile !== "object" || Array.isArray(data.profile))) {
    throw new Error("profile must be an object");
  }
  const profile = data.profile === undefined ? undefined : normalizeProfile(data.profile);
  if (Object.keys(updateData).length === 0 && profile === undefined) throw new Error("No fields to update");

  return prisma.$transaction(async (tx) => {
    if (Object.keys(updateData).length > 0) await tx.user.update({ where: { id }, data: updateData });
    if (profile && Object.keys(profile).length > 0) {
      await tx.profile.upsert({ where: { userId: id }, create: { userId: id, ...profile }, update: profile });
    }
    return tx.user.findUnique({
      where: { id },
      select: {
        id: true, name: true, email: true, studentCode: true, role: true, avatar: true,
        profile: { select: { phone: true, birthDate: true, emailPersonal: true, nameSchool: true, nameClass: true, major: true, department: true, title: true, story: true } },
      },
    });
  });
};

export const resetPassword = async (id, newPassword) => {
  const user = await prisma.user.findUnique({ where: { id } });
  if (!user) throw new Error("User not found");

  const saltRounds = 10;
  const hashedPassword = await bcrypt.hash(newPassword, saltRounds);

  return prisma.user.update({
    where: { id },
    data: { password: hashedPassword }
  });
};

export const deleteUser = async (id, actorId) => {
  if (id === actorId) throw new Error("You cannot delete your own account");
  const user = await prisma.user.findUnique({ where: { id } });
  if (!user) throw new Error("User not found");

  if (user.role === "ADMIN") {
    const adminCount = await prisma.user.count({ where: { role: "ADMIN" } });
    if (adminCount <= 1) throw new Error("At least one admin account must remain");
  }

  return prisma.user.delete({
    where: { id }
  });
};
