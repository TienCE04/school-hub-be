import prisma from "../../config/prisma.js";

const MAX_PERSONAL_STORAGE = 2 * 1024 * 1024 * 1024; // 2GB
const MAX_SHARED_STORAGE = 5 * 1024 * 1024 * 1024; // 5GB

export const getStorageUsage = async (userId) => {
  const personalFiles = await prisma.driveFile.aggregate({
    where: { ownerId: userId, isShared: false },
    _sum: { size: true }
  });
  
  const sharedFiles = await prisma.driveFile.aggregate({
    where: { ownerId: userId, isShared: true },
    _sum: { size: true }
  });

  return {
    personalUsed: personalFiles._sum.size || 0,
    personalMax: MAX_PERSONAL_STORAGE,
    sharedUsed: sharedFiles._sum.size || 0,
    sharedMax: MAX_SHARED_STORAGE
  };
};

export const uploadFile = async (userId, data) => {
  const { name, url, mimeType, size, isShared, classId } = data;

  const usage = await getStorageUsage(userId);

  if (isShared) {
    if (!classId) throw new Error("classId is required for shared files");
    if (usage.sharedUsed + size > MAX_SHARED_STORAGE) {
      throw new Error("Shared storage limit exceeded (Max 5GB)");
    }
  } else {
    if (usage.personalUsed + size > MAX_PERSONAL_STORAGE) {
      throw new Error("Personal storage limit exceeded (Max 2GB)");
    }
  }

  return prisma.driveFile.create({
    data: {
      name,
      url,
      mimeType,
      size,
      isShared,
      classId: isShared ? classId : null,
      ownerId: userId
    }
  });
};

export const listPersonalFiles = async (userId) => {
  return prisma.driveFile.findMany({
    where: { ownerId: userId, isShared: false },
    orderBy: { createdAt: 'desc' }
  });
};

export const listClassSharedFiles = async (classId) => {
  return prisma.driveFile.findMany({
    where: { classId, isShared: true },
    include: { owner: { select: { id: true, name: true, email: true, avatar: true } } },
    orderBy: { createdAt: 'desc' }
  });
};

export const deleteFile = async (userId, fileId) => {
  const file = await prisma.driveFile.findUnique({ where: { id: fileId } });
  if (!file) throw new Error("File not found");
  
  if (file.ownerId !== userId) {
    throw new Error("Permission denied");
  }

  return prisma.driveFile.delete({ where: { id: fileId } });
};
