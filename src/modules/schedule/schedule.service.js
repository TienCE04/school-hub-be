import * as repo from "../schedule/schedule.repository.js";


const toISO = (date) => date?.toISOString();


export const getSemesterDetails = async (semesterId) => {
  const semester = await repo.findSemesterWithSubjects(semesterId);

  if (!semester) {
    throw new Error("Semester not found");
  }

  return {
    id: semester.id,
    semesterName: semester.semesterName,
    startDate: toISO(semester.startDate),
    endDate: toISO(semester.endDate),
    totalWeeks: semester.totalWeeks,
    subjects: semester.subjects.map((s) => ({
      id: s.id,
      title: s.title,
      subjectCode: s.subjectCode,
      classCode: s.classCode,
      location: s.location,
      startDateTime: toISO(s.startDateTime),
      endDateTime: toISO(s.endDateTime),
      weekRanges: s.weekRanges,
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

  return repo.addSubjectToSemester(semesterId, data);
};