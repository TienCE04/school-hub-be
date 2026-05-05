import prisma from "../../config/prisma.js";

// GET 1 semester + subjects
export const findSemesterWithSubjects = (semesterId) => {
  return prisma.semester.findUnique({
    where: { id: semesterId },
    include: {
      subjects: {
        orderBy: {
          startDate: "asc"
        }
      }
    }
  });
};

// GET all semesters 
export const getAllSemesters = () => {
  return prisma.semester.findMany({
    orderBy: { startDate: "desc" },
    select: {
      id: true,
      semesterName: true,
      startDate: true,
      endDate: true,
      totalWeeks: true
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
      totalWeeks: data.totalWeeks
    }
  });
};

// CREATE subject in semester
export const addSubjectToSemester = (semesterId, data) => {
  const membersData = [];
  if (data.teacherId) membersData.push({ userId: data.teacherId });
  if (data.studentIds && data.studentIds.length > 0) {
    data.studentIds.forEach(id => membersData.push({ userId: id }));
  }

  return prisma.subject.create({
    data: {
      title: data.title,
      subjectCode: data.subjectCode,
      classCode: data.classCode,
      location: data.location,
      startTime: data.startTime,
      endTime: data.endTime,
      startDate: data.startDate,
      weekRanges: data.weekRanges,
      session: data.session,
      classId: data.classId,
      semesterId,
      members: membersData.length > 0 ? {
        create: membersData
      } : undefined
    }
  });
};

// GET user's schedule (subjects)
export const findUserSubjects = (userId, semesterId) => {
  const whereClause = {
    members: {
      some: {
        userId
      }
    }
  };
  
  if (semesterId) {
    whereClause.semesterId = semesterId;
  }

  return prisma.subject.findMany({
    where: whereClause,
    include: {
      semester: true,
      class: {
        select: { id: true, name: true, code: true }
      }
    },
    orderBy: {
      startDate: "asc"
    }
  });
};