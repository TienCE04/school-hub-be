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
      semesterId
    }
  });
};