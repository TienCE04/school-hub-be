
export const createSemesterDto = (data) => {
  const { semesterName, startDate, endDate, totalWeeks } = data;
  if (!semesterName || !startDate || !endDate) {
    throw new Error("Missing required semester info");
  }
  if (isNaN(totalWeeks)) {
    throw new Error("totalWeeks must be a number");
  }
  return {
    semesterName,   
    startDate: new Date(startDate),
    endDate: new Date(endDate),
    totalWeeks: Number(totalWeeks),
  };
};

export const createSubjectDto = (data) => {
  const {
    title,
    subjectCode,
    classCode,
    startDateTime,
    endDateTime,
    weekRanges,
    ...rest
  } = data;

  if (!title || !subjectCode || !classCode) {
    throw new Error("Missing required subject fields");
  }

  // validate date
  if (!startDateTime || !endDateTime) {
    throw new Error("Missing datetime");
  }

  // validate weekRanges
  if (!Array.isArray(weekRanges)) {
    throw new Error("weekRanges must be an array");
  }

  const normalizedWeekRanges = weekRanges.map((r) => {
    if (Array.isArray(r)) {
      const [startWeek, endWeek] = r;
      return { startWeek, endWeek };
    }

    if (typeof r === "object" && r !== null) {
      return {
        startWeek: r.startWeek,
        endWeek: r.endWeek
      };
    }

    throw new Error("Invalid weekRange format");
  });

  return {
    title,
    subjectCode,
    classCode,
    startDateTime: new Date(startDateTime),
    endDateTime: new Date(endDateTime),
    weekRanges: normalizedWeekRanges
  };
};