import bcrypt from "bcrypt";
import { randomBytes } from "node:crypto";
import prisma from "../src/config/prisma.js";

if (process.env.NODE_ENV === "production") {
  throw new Error("The demo seed is for local development only.");
}

const demoUsers = [
  { name: "School Hub Admin", email: "admin@school.com", role: "ADMIN" },
  { name: "Nguyen Van Teacher", email: "t1@school.com", role: "TEACHER" },
  {
    name: "Nguyen Van Student",
    email: "s1@school.com",
    studentCode: "DEMO001",
    role: "STUDENT",
  },
];

const ensureUser = async (data) => {
  const existing = await prisma.user.findUnique({ where: { email: data.email } });
  if (existing) return { user: existing, credential: null };

  const password = process.env.SEED_PASSWORD || randomBytes(18).toString("base64url");
  const user = await prisma.user.create({
    data: {
      ...data,
      password: await bcrypt.hash(password, 10),
    },
  });

  return { user, credential: { email: user.email, password } };
};

const ensureClassMember = (userId, classId) =>
  prisma.classMember.upsert({
    where: { userId_classId: { userId, classId } },
    update: { status: "ACTIVE", leftAt: null },
    create: { userId, classId },
  });

async function main() {
  const credentials = [];
  const users = {};

  for (const data of demoUsers) {
    const result = await ensureUser(data);
    users[data.role] = result.user;
    if (result.credential) credentials.push(result.credential);
  }

  const classRecord = await prisma.class.upsert({
    where: { code: "SE-2026-01" },
    update: {
      name: "Software Engineering 2026",
      description: "Lớp mẫu để thử nghiệm School Hub.",
    },
    create: {
      name: "Software Engineering 2026",
      description: "Lớp mẫu để thử nghiệm School Hub.",
      code: "SE-2026-01",
    },
  });

  await Promise.all([
    ensureClassMember(users.TEACHER.id, classRecord.id),
    ensureClassMember(users.STUDENT.id, classRecord.id),
  ]);

  const semesterName = "Demo Semester 2026–2027";
  const semesterData = {
    semesterName,
    startDate: new Date("2026-09-01T00:00:00.000Z"),
    endDate: new Date("2027-01-15T23:59:59.000Z"),
    totalWeeks: 20,
    weekRanges: [{ startWeek: 1, endWeek: 20 }],
  };
  const existingSemester = await prisma.semester.findFirst({ where: { semesterName } });
  const semester = existingSemester
    ? await prisma.semester.update({ where: { id: existingSemester.id }, data: semesterData })
    : await prisma.semester.create({ data: semesterData });

  const subject = await prisma.subject.upsert({
    where: { classId: classRecord.id },
    update: {
      title: "Lập trình ứng dụng web",
      subjectCode: "SE101",
      classCode: classRecord.code,
      location: "Phòng Lab 1",
      startTime: new Date("2026-09-02T01:00:00.000Z"),
      endTime: new Date("2026-09-02T03:00:00.000Z"),
      startDate: new Date("2026-09-02T00:00:00.000Z"),
      session: "MORNING",
      semesterId: semester.id,
    },
    create: {
      title: "Lập trình ứng dụng web",
      subjectCode: "SE101",
      classCode: classRecord.code,
      location: "Phòng Lab 1",
      startTime: new Date("2026-09-02T01:00:00.000Z"),
      endTime: new Date("2026-09-02T03:00:00.000Z"),
      startDate: new Date("2026-09-02T00:00:00.000Z"),
      session: "MORNING",
      semesterId: semester.id,
      classId: classRecord.id,
    },
  });

  for (const user of [users.TEACHER, users.STUDENT]) {
    await prisma.subjectMember.upsert({
      where: { userId_subjectId: { userId: user.id, subjectId: subject.id } },
      update: {},
      create: { userId: user.id, subjectId: subject.id },
    });
  }

  const announcementTitle = "Chào mừng đến với School Hub";
  const existingAnnouncement = await prisma.post.findFirst({
    where: { title: announcementTitle, classId: classRecord.id, type: "ANNOUNCEMENT" },
  });
  const stableAnnouncement = existingAnnouncement
    ? await prisma.post.update({
        where: { id: existingAnnouncement.id },
        data: { content: "Đây là thông báo mẫu của lớp. Chúc các bạn học tốt!" },
      })
    : await prisma.post.create({
        data: {
          title: announcementTitle,
          content: "Đây là thông báo mẫu của lớp. Chúc các bạn học tốt!",
          type: "ANNOUNCEMENT",
          authorId: users.TEACHER.id,
          classId: classRecord.id,
        },
      });

  const assignmentTitle = "Bài tập mẫu: API quản lý lớp học";
  const existingAssignment = await prisma.post.findFirst({
    where: { title: assignmentTitle, classId: classRecord.id, type: "ASSIGNMENT" },
  });
  const assignment = existingAssignment
    ? await prisma.post.update({
        where: { id: existingAssignment.id },
        data: { dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) },
      })
    : await prisma.post.create({
        data: {
          title: assignmentTitle,
          content: "Thiết kế các API CRUD cơ bản cho một lớp học.",
          type: "ASSIGNMENT",
          dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
          authorId: users.TEACHER.id,
          classId: classRecord.id,
        },
      });

  await prisma.submission.upsert({
    where: { studentId_postId: { studentId: users.STUDENT.id, postId: assignment.id } },
    update: {},
    create: {
      studentId: users.STUDENT.id,
      postId: assignment.id,
      status: "SUBMITTED",
      submittedAt: new Date(),
    },
  });

  const commentContent = "Em đã nhận được thông báo ạ.";
  const existingComment = await prisma.comment.findFirst({
    where: {
      content: commentContent,
      postId: stableAnnouncement.id,
      authorId: users.STUDENT.id,
    },
  });
  if (!existingComment) {
    await prisma.comment.create({
      data: {
        content: commentContent,
        postId: stableAnnouncement.id,
        authorId: users.STUDENT.id,
      },
    });
  }

  console.log(`Demo seed ready: ${classRecord.code}, subject ${subject.subjectCode}.`);
  if (credentials.length) {
    console.log("New demo account credentials (shown only when accounts are created):");
    for (const credential of credentials) {
      console.log(`${credential.email} / ${credential.password}`);
    }
  } else {
    console.log("Demo accounts already existed; their passwords were left unchanged.");
  }
}

main()
  .catch((error) => {
    console.error("Demo seed failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
