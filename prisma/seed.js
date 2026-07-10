import prisma from "../src/config/prisma.js";
import bcrypt from "bcrypt";

async function main() {
  console.log("Start seeding...");

  // Clean up existing data to prevent unique constraint errors
  await prisma.classMember.deleteMany();
  await prisma.subjectMember.deleteMany();
  await prisma.subject.deleteMany();
  await prisma.class.deleteMany();
  await prisma.semester.deleteMany();
  await prisma.profile.deleteMany();
  await prisma.refreshToken.deleteMany();
  await prisma.user.deleteMany();

  const password = await bcrypt.hash("123456", 10);

  // 1. Create Users
  const admin = await prisma.user.create({
    data: {
      name: "Super Admin",
      email: "admin@school.com",
      password,
      role: "ADMIN",
      profile: { create: { phone: "0123456789", title: "Quản trị viên" } }
    }
  });
  console.log(`Created Admin: ${admin.email}`);

  const t1 = await prisma.user.create({
    data: {
      name: "Nguyễn Văn A (Teacher 1)",
      email: "t1@school.com",
      password,
      role: "TEACHER",
      profile: { create: { phone: "0111111111", department: "Toán Tin" } }
    }
  });

  const t2 = await prisma.user.create({
    data: {
      name: "Trần Thị B (Teacher 2)",
      email: "t2@school.com",
      password,
      role: "TEACHER",
      profile: { create: { phone: "0222222222", department: "Công nghệ phần mềm" } }
    }
  });
  console.log(`Created 2 Teachers`);

  const s1 = await prisma.user.create({ data: { name: "Lê Sinh Viên 1", email: "s1@school.com", studentCode: "SV001", password, role: "STUDENT", profile: { create: { phone: "0333333331", major: "CNTT" } } }});
  const s2 = await prisma.user.create({ data: { name: "Phạm Sinh Viên 2", email: "s2@school.com", studentCode: "SV002", password, role: "STUDENT", profile: { create: { phone: "0333333332", major: "CNTT" } } }});
  const s3 = await prisma.user.create({ data: { name: "Hoàng Sinh Viên 3", email: "s3@school.com", studentCode: "SV003", password, role: "STUDENT", profile: { create: { phone: "0333333333", major: "CNTT" } } }});
  const s4 = await prisma.user.create({ data: { name: "Đinh Sinh Viên 4", email: "s4@school.com", studentCode: "SV004", password, role: "STUDENT", profile: { create: { phone: "0333333334", major: "HTTT" } } }});
  const s5 = await prisma.user.create({ data: { name: "Vũ Sinh Viên 5", email: "s5@school.com", studentCode: "SV005", password, role: "STUDENT", profile: { create: { phone: "0333333335", major: "HTTT" } } }});
  console.log(`Created 5 Students`);

  // 2. Create Semester
  const semester = await prisma.semester.create({
    data: {
      semesterName: "Học kỳ 1 - 2026",
      startDate: new Date("2026-09-01"),
      endDate: new Date("2026-12-31"),
      totalWeeks: 15,
      weekRanges: [{ startWeek: 1, endWeek: 15 }]
    }
  });
  console.log(`Created Semester: ${semester.semesterName}`);

  // 3. Define Subjects & Classes
  // Group 1: 3 students + 1 teacher
  const group1Users = [t1.id, s1.id, s2.id, s3.id];
  // Group 2: 2 students + 1 teacher
  const group2Users = [t2.id, s4.id, s5.id];

  const subjects = [
    { title: "Toán cao cấp", group: group1Users },
    { title: "Vật lý đại cương", group: group1Users },
    { title: "Lập trình C++", group: group1Users },
    { title: "Cấu trúc dữ liệu", group: group2Users },
    { title: "Cơ sở dữ liệu", group: group2Users }
  ];

  for (const subj of subjects) {
    let code;
    let exists = true;
    while (exists) {
      code = Math.floor(100000 + Math.random() * 900000).toString();
      const found = await prisma.class.findUnique({ where: { code } });
      if (!found) exists = false;
    }

    // Create Class
    const newClass = await prisma.class.create({
      data: {
        name: `${subj.title}`,
        code: code,
        members: {
          create: subj.group.map(uid => ({ userId: uid }))
        }
      }
    });

    // Create Subject
    await prisma.subject.create({
      data: {
        title: subj.title,
        subjectCode: `SUBJ-${code}`,
        classCode: code,
        location: "Phòng 101",
        startTime: new Date("2026-09-01T08:00:00Z"),
        endTime: new Date("2026-09-01T10:00:00Z"),
        startDate: new Date("2026-09-01"),
        session: "MORNING",
        classId: newClass.id,
        semesterId: semester.id,
        members: {
          create: subj.group.map(uid => ({ userId: uid }))
        }
      }
    });
    console.log(`Created Subject & Class: ${subj.title} (${code})`);
  }

  console.log("Seeding finished successfully.");
}

main()
  .catch(e => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
