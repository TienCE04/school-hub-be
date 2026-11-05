import { badRequest, parseDateTime } from "./attendance.service.shared.js";

export const resolveSessionTiming = (startMode, rawStartsAt, durationMinutes, subject, now = new Date()) => {
  if (!["MANUAL", "SCHEDULED"].includes(startMode)) {
    throw badRequest("startMode must be MANUAL or SCHEDULED");
  }
  const subjectEnd = subject.endTime;
  if (subjectEnd <= now) throw badRequest("Thời gian môn học đã kết thúc");
  const startsAt = startMode === "SCHEDULED" ? parseDateTime(rawStartsAt, "startsAt") : null;
  if (startsAt && startsAt.getTime() < now.getTime() + 5 * 60_000) {
    throw badRequest("Thời gian bắt đầu phải cách hiện tại ít nhất 5 phút");
  }
  if (startsAt && startsAt < subject.startTime) {
    throw badRequest("Thời gian bắt đầu phải nằm trong giờ học");
  }
  const expiresAt = startsAt ? new Date(startsAt.getTime() + durationMinutes * 60_000) : subjectEnd;
  if (startsAt && expiresAt > subjectEnd) {
    throw badRequest("Thời lượng điểm danh phải kết thúc trước giờ kết thúc môn học");
  }
  return { startsAt, expiresAt };
};
