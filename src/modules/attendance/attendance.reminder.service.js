import prisma from "../../config/prisma.js";
import { sendPushNotificationToUsers } from "../../shared/utils/fcm.js";
import { NOTIFICATION_CATEGORIES, SOCKET_PAYLOAD_TYPES } from "../../shared/constants/notification.constants.js";

const REMINDER_LEAD_MS = 15 * 60_000;
const CLAIM_STALE_MS = 2 * 60_000;

const formatReminderTime = (value) => new Intl.DateTimeFormat("vi-VN", {
  timeZone: "Asia/Ho_Chi_Minh",
  hour: "2-digit",
  minute: "2-digit",
}).format(value);

export const sendUpcomingAttendanceReminders = async (now = new Date()) => {
  const latestReminderAt = new Date(now.getTime() + REMINDER_LEAD_MS);
  const staleClaimBefore = new Date(now.getTime() - CLAIM_STALE_MS);
  const sessions = await prisma.attendanceSession.findMany({
    where: {
      status: { in: ["DRAFT", "SCHEDULED", "ACTIVE"] },
      reminderAt: { gt: now, lte: latestReminderAt },
      reminderSentAt: null,
      OR: [
        { reminderClaimedAt: null },
        { reminderClaimedAt: { lte: staleClaimBefore } },
      ],
    },
    take: 100,
    orderBy: { reminderAt: "asc" },
    select: {
      id: true,
      classId: true,
      teacherId: true,
      reminderAt: true,
      class: {
        select: {
          name: true,
          code: true,
          members: {
            where: {
              status: "ACTIVE",
              user: { is: { role: "STUDENT" } },
            },
            select: { userId: true },
          },
        },
      },
      subject: { select: { title: true } },
    },
  });

  let delivered = 0;
  for (const session of sessions) {
    const claim = await prisma.attendanceSession.updateMany({
      where: {
        id: session.id,
        status: { in: ["DRAFT", "SCHEDULED", "ACTIVE"] },
        reminderSentAt: null,
        OR: [
          { reminderClaimedAt: null },
          { reminderClaimedAt: { lte: staleClaimBefore } },
        ],
      },
      data: { reminderClaimedAt: now },
    });
    if (claim.count !== 1) continue;

    try {
      const recipients = [...new Set([
        session.teacherId,
        ...session.class.members.map((member) => member.userId),
      ])];
      const subjectName = session.subject?.title || "môn học";
      const startsAt = session.reminderAt.toISOString();
      const deliveredAttempt = await sendPushNotificationToUsers(recipients, {
        type: SOCKET_PAYLOAD_TYPES.NOTIFICATION,
        data: {
          notificationType: NOTIFICATION_CATEGORIES.ATTENDANCE,
          notificationKind: "attendance_upcoming",
          title: "Sắp đến giờ điểm danh",
          content: `Lớp ${session.class.code} sẽ điểm danh môn ${subjectName} lúc ${formatReminderTime(session.reminderAt)}.`,
          classId: session.classId,
          classCode: session.class.code,
          sessionId: session.id,
          startsAt,
          reminderAt: startsAt,
        },
      });

      if (!deliveredAttempt) {
        await prisma.attendanceSession.updateMany({
          where: { id: session.id, reminderClaimedAt: now, reminderSentAt: null },
          data: { reminderClaimedAt: null },
        });
        continue;
      }

      await prisma.attendanceSession.updateMany({
        where: { id: session.id, reminderClaimedAt: now, reminderSentAt: null },
        data: { reminderClaimedAt: null, reminderSentAt: now },
      });
      delivered += 1;
    } catch (error) {
      await prisma.attendanceSession.updateMany({
        where: { id: session.id, reminderClaimedAt: now, reminderSentAt: null },
        data: { reminderClaimedAt: null },
      });
      console.error(`Unable to send attendance reminder for session ${session.id}:`, error);
    }
  }

  return delivered;
};
