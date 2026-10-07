import * as repo from "../schedule/schedule.repository.js";
import prisma from "../../config/prisma.js";
import { updateSemesterDto } from "./dto/semester.dto.js";

const toISO = (date) => date?.toISOString();


export const getSemesterDetails = async (userId, semesterId) => {
  let finalSemesterId = semesterId;

  if (!finalSemesterId) {
    const semesters = await repo.getAllSemesters();
    if (semesters.length > 0) {
      finalSemesterId = semesters[0].id;
    } else {
      throw new Error("No semesters available");
    }
  }

  const semester = await repo.findUserSubjects(userId, finalSemesterId);

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
    totalWeeks: s.totalWeeks,
    subjectCount: s._count?.subjects || 0,
  }));
};


export const createSemester = async (data) => {
  return repo.createSemester(data);
};

export const updateSemester = async (id, data) => {
  const current = await repo.findSemesterWithSubjects(id);
  if (!current) throw new Error("Semester not found");
  const normalizedData = updateSemesterDto(data, current);
  return repo.updateSemester(id, normalizedData);
};

export const deleteSemester = async (id) => {
  const semester = await repo.findSemesterWithSubjects(id);
  if (!semester) throw new Error("Semester not found");
  if (semester && semester.subjects && semester.subjects.length > 0) {
    throw new Error("Cannot delete semester with associated subjects");
  }
  return repo.deleteSemester(id);
};


export const addSubjectToSemester = async (semesterId, data) => {
  const semester = await repo.findSemesterWithSubjects(semesterId);

  if (!semester) {
    throw new Error("Semester not found");
  }

  if (!data.title || !data.subjectCode) {
    throw new Error("title and subjectCode are required");
  }

  await validateSubjectMembers(data.teacherId, data.studentIds || []);
  if (data.classId !== undefined) {
    const classExists = await prisma.class.findUnique({ where: { id: data.classId } });
    if (!classExists) throw new Error("Class not found");
  }

  return repo.addSubjectToSemester(semesterId, data);
};

const validateSubjectMembers = async (teacherId, studentIds) => {
  const ids = [...new Set([teacherId, ...studentIds].filter(Boolean))];
  if (ids.length === 0) return;

  const users = await prisma.user.findMany({
    where: { id: { in: ids } },
    select: { id: true, role: true },
  });
  if (users.length !== ids.length) throw new Error("One or more assigned users were not found");
  if (teacherId !== undefined && teacherId !== null) {
    const teacher = users.find((user) => user.id === teacherId);
    if (!teacher || teacher.role !== "TEACHER") throw new Error("Assigned user must be a teacher");
  }
  const studentIdSet = new Set(studentIds);
  if (users.some((user) => studentIdSet.has(user.id) && user.role !== "STUDENT")) {
    throw new Error("Assigned students must have the STUDENT role");
  }
};

const serializeSubject = (subject) => ({
  id: subject.id,
  title: subject.title,
  subjectCode: subject.subjectCode,
  classCode: subject.classCode,
  location: subject.location,
  startTime: toISO(subject.startTime),
  endTime: toISO(subject.endTime),
  startDate: toISO(subject.startDate),
  session: subject.session,
  classId: subject.classId,
  semesterId: subject.semesterId,
  class: subject.class || null,
  teacher: subject.members?.find((member) => member.user.role === "TEACHER")?.user || null,
  students: subject.members
    ?.filter((member) => member.user.role === "STUDENT")
    .map((member) => member.user) || [],
});

export const getAdminSubjects = async (semesterId) => {
  const semester = await repo.findSemesterWithSubjects(semesterId);
  if (!semester) throw new Error("Semester not found");
  const subjects = await repo.getSubjectsBySemester(semesterId);
  return subjects.map(serializeSubject);
};

export const updateSubject = async (id, data) => {
  const current = await repo.findSubjectById(id);
  if (!current) throw new Error("Subject not found");

  const merged = {
    title: data.title ?? current.title,
    subjectCode: data.subjectCode ?? current.subjectCode,
    classCode: data.classCode ?? current.classCode,
    location: data.location ?? current.location,
    session: data.session ?? current.session,
    startTime: data.startTime ?? current.startTime,
    endTime: data.endTime ?? current.endTime,
    startDate: data.startDate ?? current.startDate,
  };
  if (merged.endTime <= merged.startTime) throw new Error("endTime must be after startTime");

  if (data.classId !== undefined && data.classId !== null) {
    const classExists = await prisma.class.findUnique({ where: { id: data.classId } });
    if (!classExists) throw new Error("Class not found");
  }
  await validateSubjectMembers(data.teacherId, data.studentIds || []);

  const updated = await repo.updateSubject(id, {
    ...data,
    ...(data.teacherId !== undefined ? { teacherId: data.teacherId } : {}),
  });
  const refreshed = await repo.findSubjectById(updated.id);
  return serializeSubject(refreshed);
};

export const deleteSubject = async (id) => {
  const subject = await repo.findSubjectById(id);
  if (!subject) throw new Error("Subject not found");
  return repo.deleteSubject(id);
};

const parseImportDateTime = (dateValue, timeValue, rowNumber, field) => {
  const dateText = String(dateValue || "").trim();
  const timeText = String(timeValue || "").trim();
  const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(dateText);
  const source = dateOnly && /^\d{2}:\d{2}(:\d{2})?$/.test(timeText)
    ? `${dateText}T${timeText.length === 5 ? `${timeText}:00` : timeText}+07:00`
    : timeText;
  const parsed = field === "startDate" && dateOnly
    ? new Date(`${dateText}T00:00:00+07:00`)
    : new Date(source);
  if (Number.isNaN(parsed.getTime())) throw new Error(`Dòng ${rowNumber}: ngày/giờ ${field} không hợp lệ`);
  return parsed;
};

export const importStudentSchedules = async (semesterId, rows) => {
  if (!Array.isArray(rows) || rows.length === 0) throw new Error("File không có dữ liệu để nhập");
  if (rows.length > 2000) throw new Error("Mỗi lần chỉ nhập tối đa 2.000 dòng");
  if (!(await repo.findSemesterWithSubjects(semesterId))) throw new Error("Semester not found");

  const normalizedRows = rows.map((row, index) => {
    const rowNumber = index + 2;
    const value = (key) => String(row?.[key] ?? "").trim();
    const studentCode = value("studentCode");
    const subjectCode = value("subjectCode");
    const classCode = value("classCode");
    const title = value("title");
    const location = value("location") || "Chưa có phòng";
    const rawSession = value("session").trim().toLowerCase();
    const sessionInput = ({
      morning: "MORNING", sang: "MORNING", "sáng": "MORNING", am: "MORNING",
      afternoon: "AFTERNOON", chieu: "AFTERNOON", "chiều": "AFTERNOON", pm: "AFTERNOON",
      evening: "EVENING", toi: "EVENING", "tối": "EVENING",
    })[rawSession] || rawSession.toUpperCase();
    const startDate = parseImportDateTime(value("startDate"), "00:00", rowNumber, "startDate");
    const startTime = parseImportDateTime(value("startDate"), value("startTime"), rowNumber, "startTime");
    const endTime = parseImportDateTime(value("startDate"), value("endTime"), rowNumber, "endTime");
    if (!studentCode || !subjectCode || !classCode || !title) {
      throw new Error(`Dòng ${rowNumber}: cần studentCode, subjectCode, classCode và title`);
    }
    if (endTime <= startTime) throw new Error(`Dòng ${rowNumber}: endTime phải sau startTime`);
    const inferredSession = Number(startTime.toLocaleString("en-US", { timeZone: "Asia/Ho_Chi_Minh", hour: "2-digit", hour12: false })) < 12
      ? "MORNING"
      : Number(startTime.toLocaleString("en-US", { timeZone: "Asia/Ho_Chi_Minh", hour: "2-digit", hour12: false })) < 17 ? "AFTERNOON" : "EVENING";
    const session = sessionInput || inferredSession;
    if (!["MORNING", "AFTERNOON", "EVENING"].includes(session)) throw new Error(`Dòng ${rowNumber}: session phải là MORNING, AFTERNOON hoặc EVENING`);
    return {
      rowNumber,
      studentCode,
      subjectCode,
      classCode,
      title,
      location,
      session,
      startDate,
      startTime,
      endTime,
      teacherEmail: value("teacherEmail").toLowerCase(),
    };
  });

  const studentCodes = [...new Set(normalizedRows.map((row) => row.studentCode))];
  const teacherEmails = [...new Set(normalizedRows.map((row) => row.teacherEmail).filter(Boolean))];
  const [students, teachers] = await Promise.all([
    prisma.user.findMany({ where: { studentCode: { in: studentCodes }, role: "STUDENT" }, select: { id: true, studentCode: true } }),
    teacherEmails.length
      ? prisma.user.findMany({ where: { email: { in: teacherEmails, mode: "insensitive" }, role: "TEACHER" }, select: { id: true, email: true } })
      : [],
  ]);
  const studentByCode = new Map(students.map((student) => [student.studentCode, student.id]));
  const teacherByEmail = new Map(teachers.map((teacher) => [teacher.email.toLowerCase(), teacher.id]));
  for (const row of normalizedRows) {
    if (!studentByCode.has(row.studentCode)) throw new Error(`Dòng ${row.rowNumber}: không tìm thấy sinh viên có mã ${row.studentCode}`);
    if (row.teacherEmail && !teacherByEmail.has(row.teacherEmail)) throw new Error(`Dòng ${row.rowNumber}: không tìm thấy giảng viên ${row.teacherEmail}`);
  }

  const grouped = new Map();
  for (const row of normalizedRows) {
    const key = [row.subjectCode, row.classCode, row.startDate.toISOString(), row.startTime.toISOString(), row.endTime.toISOString()].join("|");
    const teacherId = row.teacherEmail ? teacherByEmail.get(row.teacherEmail) : null;
    const details = JSON.stringify([row.title, row.location, row.session, teacherId]);
    const existing = grouped.get(key);
    if (existing && existing.details !== details) throw new Error(`Dữ liệu môn ${row.subjectCode} - lớp ${row.classCode} không thống nhất giữa các dòng`);
    if (existing) existing.studentIds.add(studentByCode.get(row.studentCode));
    else grouped.set(key, { ...row, details, teacherId, studentIds: new Set([studentByCode.get(row.studentCode)]) });
  }

  const imported = await prisma.$transaction(async (tx) => {
    const results = [];
    for (const group of grouped.values()) {
      const subjectData = {
        title: group.title,
        subjectCode: group.subjectCode,
        classCode: group.classCode,
        location: group.location,
        session: group.session,
        startDate: group.startDate,
        startTime: group.startTime,
        endTime: group.endTime,
      };
      const subject = await tx.subject.findFirst({
        where: {
          semesterId,
          subjectCode: group.subjectCode,
          classCode: group.classCode,
          startDate: group.startDate,
          startTime: group.startTime,
          endTime: group.endTime,
        },
        select: { id: true },
      });
      const saved = subject
        ? await tx.subject.update({ where: { id: subject.id }, data: subjectData })
        : await tx.subject.create({ data: { ...subjectData, semesterId } });
      const memberIds = [...group.studentIds, ...(group.teacherId ? [group.teacherId] : [])];
      await tx.subjectMember.createMany({
        data: memberIds.map((userId) => ({ subjectId: saved.id, userId })),
        skipDuplicates: true,
      });
      results.push(saved.id);
    }
    return results;
  });

  return { importedSubjects: imported.length, importedRows: normalizedRows.length, message: `Đã nhập ${imported.length} môn học từ ${normalizedRows.length} dòng.` };
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
