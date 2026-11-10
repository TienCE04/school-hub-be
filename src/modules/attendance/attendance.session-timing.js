import { badRequest, parseDateTime } from "./attendance.service.shared.js";

const TIME_ZONE = "Asia/Ho_Chi_Minh";

const localDate = (value) => new Intl.DateTimeFormat("en-CA", {
  timeZone: TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
}).format(value);

const localTime = (value) => new Intl.DateTimeFormat("en-GB", {
  timeZone: TIME_ZONE,
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
}).format(value);

const addWeeks = (dateText, weeks) => {
  const date = new Date(`${dateText}T12:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + weeks * 7);
  return date.toISOString().slice(0, 10);
};

const atLocalTime = (dateText, timeText) => new Date(`${dateText}T${timeText}:00+07:00`);

export const getSubjectLessonWindows = (subject) => {
  const semester = subject?.semester;
  if (!subject?.startDate || !subject.startTime || !subject.endTime || !semester?.weekRanges) return [];

  const ranges = semester.weekRanges
    .filter((range) => Number.isInteger(range?.startWeek) && Number.isInteger(range?.endWeek))
    .sort((left, right) => left.startWeek - right.startWeek);
  if (!ranges.length) return [];

  const firstWeek = ranges[0].startWeek;
  const firstClassDate = localDate(subject.startDate);
  const semesterStart = localDate(semester.startDate);
  const semesterEnd = localDate(semester.endDate);
  const startClock = localTime(subject.startTime);
  const endClock = localTime(subject.endTime);
  const windows = [];

  for (const range of ranges) {
    for (let week = range.startWeek; week <= range.endWeek; week += 1) {
      const date = addWeeks(firstClassDate, week - firstWeek);
      if (date < semesterStart || date > semesterEnd) continue;

      const startsAt = atLocalTime(date, startClock);
      let endsAt = atLocalTime(date, endClock);
      if (endsAt <= startsAt) endsAt = new Date(endsAt.getTime() + 24 * 60 * 60_000);
      if (localDate(endsAt) > semesterEnd) continue;
      windows.push({ startsAt, endsAt });
    }
  }
  return windows.sort((left, right) => left.startsAt - right.startsAt);
};

export const findSubjectLessonWindow = (subject, instant) =>
  getSubjectLessonWindows(subject).find((window) => instant >= window.startsAt && instant < window.endsAt) || null;

export const resolveSessionTiming = (startMode, rawStartsAt, durationMinutes, subject, now = new Date()) => {
  if (!["MANUAL", "SCHEDULED"].includes(startMode)) {
    throw badRequest("startMode must be MANUAL or SCHEDULED");
  }
  const semesterEnd = subject?.semester?.endDate;
  if (!semesterEnd || semesterEnd <= now) throw badRequest("Thời gian môn học đã kết thúc");

  if (startMode === "MANUAL") {
    const startsAt = rawStartsAt == null ? null : parseDateTime(rawStartsAt, "startsAt");
    if (startsAt) {
      const selectedLesson = getSubjectLessonWindows(subject)
        .filter((window) => window.endsAt > now)
        .slice(0, 3)
        .find((window) => window.startsAt.getTime() === startsAt.getTime());
      if (!selectedLesson) {
        throw badRequest("Buổi học đã chọn không nằm trong 3 buổi học sắp tới");
      }
    }
    return { startsAt, expiresAt: semesterEnd };
  }

  const startsAt = parseDateTime(rawStartsAt, "startsAt");
  if (startsAt.getTime() < now.getTime() + 5 * 60_000) {
    throw badRequest("Thời gian bắt đầu phải cách hiện tại ít nhất 5 phút");
  }
  const lessonWindow = findSubjectLessonWindow(subject, startsAt);
  if (!lessonWindow) throw badRequest("Thời gian bắt đầu phải thuộc một buổi học của môn học");

  const expiresAt = new Date(startsAt.getTime() + durationMinutes * 60_000);
  if (expiresAt > lessonWindow.endsAt) {
    throw badRequest("Thời lượng điểm danh phải kết thúc trong buổi học đã chọn");
  }
  return { startsAt, expiresAt };
};
