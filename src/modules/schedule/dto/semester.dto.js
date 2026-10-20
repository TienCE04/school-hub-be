
export const createSemesterDto = (data) => {
  const { semesterName, startDate, endDate } = data;
  if (!String(semesterName || "").trim() || !startDate || !endDate) {
    throw new Error("Missing required semester info");
  }

  const parsedStartDate = new Date(startDate);
  const parsedEndDate = new Date(endDate);
  if (Number.isNaN(parsedStartDate.getTime()) || Number.isNaN(parsedEndDate.getTime())) {
    throw new Error("Invalid semester dates");
  }
  if (parsedEndDate < parsedStartDate) throw new Error("endDate must be after startDate");

  const calculatedTotalWeeks = Math.max(
    1,
    Math.ceil((parsedEndDate.getTime() - parsedStartDate.getTime() + 24 * 60 * 60 * 1000) / (7 * 24 * 60 * 60 * 1000)),
  );
  const totalWeeks = data.totalWeeks === undefined ? calculatedTotalWeeks : Number(data.totalWeeks);
  if (!Number.isInteger(totalWeeks) || totalWeeks <= 0) {
    throw new Error("totalWeeks must be a positive integer");
  }

  const weekRanges = data.weekRanges ?? [{ startWeek: 1, endWeek: totalWeeks }];
  if (!Array.isArray(weekRanges)) {
    throw new Error("weekRanges must be an array");
  }

  const normalizedWeekRanges = weekRanges.map((r) => {
    if (Array.isArray(r)) {
      const [startWeek, endWeek] = r;
      return { startWeek, endWeek };
    }
    if (typeof r === "object" && r !== null) {
      return { startWeek: r.startWeek, endWeek: r.endWeek };
    }
    throw new Error("Invalid weekRange format");
  });

  return {
    semesterName: String(semesterName).trim(),
    startDate: parsedStartDate,
    endDate: parsedEndDate,
    totalWeeks,
    weekRanges: normalizedWeekRanges,
  };
};

export const updateSemesterDto = (data, currentSemester) => {
  const nextName = data.semesterName === undefined
    ? currentSemester.semesterName
    : String(data.semesterName).trim();
  const nextStartDate = data.startDate === undefined
    ? currentSemester.startDate
    : new Date(data.startDate);
  const nextEndDate = data.endDate === undefined
    ? currentSemester.endDate
    : new Date(data.endDate);

  if (!nextName) throw new Error("semesterName is required");
  if (Number.isNaN(nextStartDate.getTime()) || Number.isNaN(nextEndDate.getTime())) {
    throw new Error("Invalid semester dates");
  }
  if (nextEndDate < nextStartDate) throw new Error("endDate must be after startDate");

  const calculatedTotalWeeks = Math.max(
    1,
    Math.ceil((nextEndDate.getTime() - nextStartDate.getTime() + 24 * 60 * 60 * 1000) / (7 * 24 * 60 * 60 * 1000)),
  );
  const totalWeeks = data.totalWeeks === undefined ? calculatedTotalWeeks : Number(data.totalWeeks);
  if (!Number.isInteger(totalWeeks) || totalWeeks <= 0) {
    throw new Error("totalWeeks must be a positive integer");
  }

  return {
    semesterName: nextName,
    startDate: nextStartDate,
    endDate: nextEndDate,
    totalWeeks,
    weekRanges: data.weekRanges ?? [{ startWeek: 1, endWeek: totalWeeks }],
  };
};

export const createSubjectDto = (data) => {
  const {
    title,
    subjectCode,
    classCode,
    location,
    session,
    startTime,
    endTime,
    startDate,
    teacherId,
    studentIds,
    classId
  } = data;

  if (!String(title || "").trim() || !String(subjectCode || "").trim()) {
    throw new Error("Missing required subject fields");
  }

  if (!startTime || !endTime || !startDate) {
    throw new Error("Missing datetime fields (startTime, endTime, startDate)");
  }

  if (!String(location || "").trim() || !["MORNING", "AFTERNOON", "EVENING"].includes(session)) {
    throw new Error("Missing location or session");
  }

  const parsedStartTime = new Date(startTime);
  const parsedEndTime = new Date(endTime);
  const parsedStartDate = new Date(startDate);
  if ([parsedStartTime, parsedEndTime, parsedStartDate].some((date) => Number.isNaN(date.getTime()))) {
    throw new Error("Invalid subject datetime");
  }
  if (parsedEndTime <= parsedStartTime) throw new Error("endTime must be after startTime");

  let finalClassCode = classCode;
  if (!finalClassCode) {
    finalClassCode = Math.floor(100000 + Math.random() * 900000).toString();
  }

  return {
    title: String(title).trim(),
    subjectCode: String(subjectCode).trim(),
    classCode: String(finalClassCode),
    location: String(location).trim(),
    session,
    startTime: parsedStartTime,
    endTime: parsedEndTime,
    startDate: parsedStartDate,
    teacherId: teacherId ? Number(teacherId) : undefined,
    studentIds: Array.isArray(studentIds) ? studentIds.map(Number) : [],
    classId: classId ? Number(classId) : undefined
  };
};

export const updateSubjectDto = (data) => {
  const allowed = ["title", "subjectCode", "classCode", "location", "session", "startTime", "endTime", "startDate", "classId", "teacherId", "studentIds"];
  if (Object.keys(data).some((key) => !allowed.includes(key))) {
    throw new Error("Unsupported subject field");
  }

  const result = {};
  if (data.title !== undefined) {
    result.title = String(data.title).trim();
    if (!result.title) throw new Error("title is required");
  }
  if (data.subjectCode !== undefined) {
    result.subjectCode = String(data.subjectCode).trim();
    if (!result.subjectCode) throw new Error("subjectCode is required");
  }
  if (data.classCode !== undefined) {
    result.classCode = String(data.classCode).trim();
    if (!result.classCode) throw new Error("classCode is required");
  }
  if (data.location !== undefined) {
    result.location = String(data.location).trim();
    if (!result.location) throw new Error("location is required");
  }
  if (data.session !== undefined) {
    if (!["MORNING", "AFTERNOON", "EVENING"].includes(data.session)) throw new Error("Invalid session");
    result.session = data.session;
  }
  for (const field of ["startTime", "endTime", "startDate"]) {
    if (data[field] !== undefined) {
      const parsed = new Date(data[field]);
      if (Number.isNaN(parsed.getTime())) throw new Error(`Invalid ${field}`);
      result[field] = parsed;
    }
  }
  if (result.startTime && result.endTime && result.endTime <= result.startTime) {
    throw new Error("endTime must be after startTime");
  }
  if (data.classId !== undefined) result.classId = data.classId === null ? null : Number(data.classId);
  if (data.teacherId !== undefined) result.teacherId = data.teacherId === null ? null : Number(data.teacherId);
  if (data.studentIds !== undefined) {
    if (!Array.isArray(data.studentIds)) throw new Error("studentIds must be an array");
    result.studentIds = [...new Set(data.studentIds.map(Number))];
  }

  if (Object.keys(result).length === 0) throw new Error("No fields to update");
  return result;
};
