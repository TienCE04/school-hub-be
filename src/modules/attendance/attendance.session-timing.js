import { badRequest, parseDateTime } from "./attendance.service.shared.js";

export const resolveSessionTiming = (startMode, rawStartsAt, subject, now = new Date()) => {
  if (!["MANUAL", "SCHEDULED"].includes(startMode)) {
    throw badRequest("startMode must be MANUAL or SCHEDULED");
  }
  const expiresAt = subject.endTime;
  if (expiresAt <= now) throw badRequest("Thời gian môn học đã kết thúc");
  const startsAt = startMode === "SCHEDULED" ? parseDateTime(rawStartsAt, "startsAt") : null;
  if (startsAt && startsAt.getTime() < now.getTime() + 5 * 60_000) {
    throw badRequest("Thời gian bắt đầu phải cách hiện tại ít nhất 5 phút");
  }
  if (startsAt && (startsAt < subject.startTime || startsAt.getTime() > expiresAt.getTime() - 15 * 60_000)) {
    throw badRequest("Thời gian bắt đầu phải trong giờ học và trước khi môn học kết thúc ít nhất 15 phút");
  }
  return { startsAt, expiresAt };
};
