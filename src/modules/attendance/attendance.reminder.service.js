import prisma from "../../config/prisma.js";

// The Android client schedules its own reminders, including sessions more than
// 15 minutes away. A teacher's draft has no committed check-in time.
export async function getReminderSchedule(user) {
  const visibility = user.role === "TEACHER"
    ? { teacherId: user.id }
    : { class: { is: { members: { some: { userId: user.id, status: "ACTIVE" } } } } };
  const sessions = await prisma.attendanceSession.findMany({
    where: { ...visibility, status: "SCHEDULED", startsAt: { gt: new Date() } },
    select: {
      id: true, classId: true, startsAt: true,
      class: { select: { code: true } },
      subject: { select: { title: true } },
    },
    orderBy: { startsAt: "asc" },
  });
  return sessions.map(session => ({
    sessionId: session.id, classId: session.classId, classCode: session.class.code,
    subjectName: session.subject?.title || session.class.code, startsAt: session.startsAt.toISOString(),
  }));
}
