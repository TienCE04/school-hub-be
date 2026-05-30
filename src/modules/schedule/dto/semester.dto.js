
export const createSemesterDto = (data) => {
  const { semesterName, startDate, endDate, totalWeeks, weekRanges } = data;
  if (!semesterName || !startDate || !endDate) {
    throw new Error("Missing required semester info");
  }
  if (isNaN(totalWeeks)) {
    throw new Error("totalWeeks must be a number");
  }

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
    semesterName,
    startDate: new Date(startDate),
    endDate: new Date(endDate),
    totalWeeks: Number(totalWeeks),
    weekRanges: normalizedWeekRanges,
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

  if (!title || !subjectCode) {
    throw new Error("Missing required subject fields");
  }

  if (!startTime || !endTime || !startDate) {
    throw new Error("Missing datetime fields (startTime, endTime, startDate)");
  }

  if (!location || !session) {
    throw new Error("Missing location or session");
  }

  let finalClassCode = classCode;
  if (!finalClassCode) {
    finalClassCode = Math.floor(100000 + Math.random() * 900000).toString();
  }

  return {
    title,
    subjectCode,
    classCode: String(finalClassCode),
    location,
    session,
    startTime: new Date(startTime),
    endTime: new Date(endTime),
    startDate: new Date(startDate),
    teacherId: teacherId ? Number(teacherId) : undefined,
    studentIds: Array.isArray(studentIds) ? studentIds.map(Number) : [],
    classId: classId ? Number(classId) : undefined
  };
};