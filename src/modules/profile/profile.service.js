import prisma from "../../config/prisma.js";

export const getProfile = async (userId) => {
  let profile = await prisma.profile.findUnique({
    where: { userId }
  });

  if (!profile) {
    // Return empty template matching DTO if not exists
    return {
      phone: null,
      birthDate: null,
      story: null,
      emailPersonal: null,
      nameSchool: null,
      nameClass: null,
      major: null,
      department: null,
      title: null
    };
  }

  const { id, userId: _, ...profileData } = profile;
  return profileData;
};

export const updateProfile = async (userId, data) => {
  const profile = await prisma.profile.upsert({
    where: { userId },
    update: data,
    create: {
      userId,
      ...data
    }
  });

  const { id, userId: _, ...profileData } = profile;
  return profileData;
};
