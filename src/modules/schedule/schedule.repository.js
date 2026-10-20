import prisma from "../../config/prisma.js";

// GET all semesters
export const getAllSemesters = () => {
  return prisma.semester.findMany({
    orderBy: { startDate: "desc" },
    select: {
      id: true,
      semesterName: true,
      startDate: true,
      endDate: true,
      totalWeeks: true,
      weekRanges: true,
      _count: { select: { subjects: true } },
    }
  });
};

// CREATE semester
export const createSemester = (data) => {
  return prisma.semester.create({
    data: {
      semesterName: data.semesterName,
      startDate: data.startDate,
      endDate: data.endDate,
      totalWeeks: data.totalWeeks,
      weekRanges: data.weekRanges
    }
  });
};

// CREATE subject in semester
export const addSubjectToSemester = (semesterId, data) => {
  const memberIds = [...new Set([
    data.teacherId,
    ...(data.studentIds || []),
  ].filter(Boolean))];

  return prisma.subject.create({
    data: {
      title: data.title,
      subjectCode: data.subjectCode,
      classCode: data.classCode,
      location: data.location,
      startTime: data.startTime,
      endTime: data.endTime,
      startDate: data.startDate,
      session: data.session,
      classId: data.classId,
      semesterId,
      members: memberIds.length > 0 ? {
        create: memberIds.map((userId) => ({ userId }))
      } : undefined
    }
  });
};

// GET user's schedule (subjects)
export const findUserSubjects = (userId, semesterId) => {
  return prisma.semester.findUnique({
    where: { id: semesterId },
    include: {
      subjects: {
        where: {
          members: {
            some: { userId }
          }
        },
        include: {
          members: {
            include: {
              user: { select: { role: true } },
            },
          },
        },
      }
    }
  });
};

export const updateSemester = (id, data) => {
  return prisma.semester.update({
    where: { id },
    data
  });
};

export const deleteSemester = (id) => {
  return prisma.semester.delete({
    where: { id }
  });
};

export const findSemesterWithSubjects = (id) => {
  return prisma.semester.findUnique({
    where: { id },
    include: { subjects: true }
  });
};
export const findSubjectById = (id) => {
  return prisma.subject.findUnique({
    where: { id },
    include: {
      members: { include: { user: { select: { id: true, name: true, email: true, role: true } } } },
      class: { select: { id: true, name: true, code: true } },
    },
  });
};

export const getSubjectsBySemester = (semesterId) => {
  return prisma.subject.findMany({
    where: { semesterId },
    orderBy: [{ startDate: "asc" }, { startTime: "asc" }, { title: "asc" }],
    include: {
      members: {
        include: {
          user: { select: { id: true, name: true, email: true, role: true, studentCode: true } },
        },
      },
      class: { select: { id: true, name: true, code: true } },
    },
  });
};

export const updateSubject = async (id, data) => {
  return prisma.$transaction(async (tx) => {
    const current = await tx.subject.findUnique({ where: { id } });
    if (!current) throw new Error("Subject not found");

    const {
      teacherId,
      studentIds,
      classId,
      classCode,
      ...subjectData
    } = data;

    const updated = await tx.subject.update({
      where: { id },
      data: {
        ...subjectData,
        ...(classId !== undefined ? { classId } : {}),
        ...(classCode !== undefined ? { classCode } : {}),
      },
    });

    if (classCode !== undefined && current.classId && classCode !== current.classCode) {
      await tx.class.update({ where: { id: current.classId }, data: { code: classCode } });
    }

    if (teacherId !== undefined) {
      await tx.subjectMember.deleteMany({
        where: { subjectId: id, user: { role: "TEACHER" } },
      });
      if (teacherId !== null) {
        await tx.subjectMember.create({ data: { subjectId: id, userId: teacherId } });
      }
    }

    if (studentIds !== undefined) {
      await tx.subjectMember.deleteMany({
        where: { subjectId: id, user: { role: "STUDENT" } },
      });
      if (studentIds.length > 0) {
        await tx.subjectMember.createMany({
          data: studentIds.map((userId) => ({ subjectId: id, userId })),
          skipDuplicates: true,
        });
      }
    }

    return updated;
  });
};

export const deleteSubject = (id) => {
  return prisma.subject.delete({ where: { id } });
};
