import * as repo from "../schedule/schedule.repository.js";
import prisma from "../../config/prisma.js";

const toISO = (date) => date?.toISOString();


export const getSemesterDetails = async (userId, semesterId) => {
  const semester = await repo.findUserSubjects(userId, semesterId);

  if (!semester) {
    throw new Error("Semester not found");
  }

  return {
    id: semester.id,
    semesterName: semester.semesterName,
    semesterStartDate: toISO(semester.startDate),
    semesterEndDate: toISO(semester.endDate),
    totalWeeks: semester.totalWeeks,
    weekRanges: semester.weekRanges,
    subjects: semester.subjects.map((s) => ({
      id: s.id,
      title: s.title,
      subjectCode: s.subjectCode,
      classCode: s.classCode,
      location: s.location,
      startTime: toISO(s.startTime),
      endTime: toISO(s.endTime),
      startDate: toISO(s.startDate),
      session: s.session,
      classId: s.classId
    }))
  };
};


export const getAllSemesters = async () => {
  const semesters = await repo.getAllSemesters();

  return semesters.map((s) => ({
    id: s.id,
    semesterName: s.semesterName,
    startDate: toISO(s.startDate),
    endDate: toISO(s.endDate),
    totalWeeks: s.totalWeeks
  }));
};


export const createSemester = async (data) => {
  if (!data.semesterName) {
    throw new Error("semesterName is required");
  }

  if (!data.startDate || !data.endDate) {
    throw new Error("startDate and endDate are required");
  }

  if (data.totalWeeks <= 0) {
    throw new Error("totalWeeks must be greater than 0");
  }

  return repo.createSemester(data);
};


export const addSubjectToSemester = async (semesterId, data) => {
  const semester = await repo.findSemesterWithSubjects(semesterId);

  if (!semester) {
    throw new Error("Semester not found");
  }

  if (!data.title || !data.subjectCode) {
    throw new Error("title and subjectCode are required");
  }

  let classId = data.classId;

  // Auto-create or link Class with Users
  if (!classId && (data.teacherId || (data.studentIds && data.studentIds.length > 0))) {
    const uniqueCode = await generateUniqueClassCode();

    const connectUsers = [];
    if (data.teacherId) connectUsers.push({ id: data.teacherId });
    if (data.studentIds && data.studentIds.length > 0) {
      data.studentIds.forEach(id => connectUsers.push({ id }));
    }

    const newClass = await prisma.class.create({
      data: {
        name: `${data.title} - ${data.classCode}`,
        code: uniqueCode,
        members: {
          create: connectUsers.map(u => ({ userId: u.id }))
        }
      }
    });
    classId = newClass.id;
  } else if (classId) {
    const connectUsers = [];
    if (data.teacherId) connectUsers.push({ id: data.teacherId });
    if (data.studentIds && data.studentIds.length > 0) {
      data.studentIds.forEach(id => connectUsers.push({ id }));
    }

    if (connectUsers.length > 0) {
      await prisma.classMember.createMany({
        data: connectUsers.map(u => ({ userId: u.id, classId })),
        skipDuplicates: true
      });
    }
  }

  const subjectData = {
    ...data,
    classId
  };

  return repo.addSubjectToSemester(semesterId, subjectData);
};

const generateUniqueClassCode = async () => {
  let code;
  let exists = true;
  while (exists) {
    code = Math.floor(100000 + Math.random() * 900000).toString();
    const found = await prisma.class.findUnique({ where: { code } });
    if (!found) exists = false;
  }
  return code;
};
