import prisma from "../src/config/prisma.js";

async function main() {
  console.log("Start seeding additional semester...");

  // Fetch existing users
  const t1 = await prisma.user.findUnique({ where: { email: "t1@school.com" } });
  const t2 = await prisma.user.findUnique({ where: { email: "t2@school.com" } });
  const s1 = await prisma.user.findUnique({ where: { email: "s1@school.com" } });
  const s2 = await prisma.user.findUnique({ where: { email: "s2@school.com" } });
  const s3 = await prisma.user.findUnique({ where: { email: "s3@school.com" } });
  const s4 = await prisma.user.findUnique({ where: { email: "s4@school.com" } });
  const s5 = await prisma.user.findUnique({ where: { email: "s5@school.com" } });

  if (!t1 || !t2 || !s1 || !s2 || !s3 || !s4 || !s5) {
    console.error("Missing some users. Please make sure the main seed has been run.");
    process.exit(1);
  }

  // 1. Create new Semester
  const semester2 = await prisma.semester.create({
    data: {
      semesterName: "Học kỳ 2 - 2026",
      startDate: new Date("2027-02-01"),
      endDate: new Date("2027-06-30"),
      totalWeeks: 15,
      weekRanges: [{ startWeek: 1, endWeek: 15 }]
    }
  });
  console.log(`Created Semester: ${semester2.semesterName}`);

  // 2. Define Subjects & Classes for the new semester
  const group1Users = [t1.id, s1.id, s2.id, s3.id];
  const group2Users = [t2.id, s4.id, s5.id];

  const subjects = [
    { title: "Mạng máy tính", group: group1Users },
    { title: "Trí tuệ nhân tạo", group: group1Users },
    { title: "Phát triển ứng dụng Web", group: group1Users },
    { title: "Hệ điều hành", group: group2Users },
    { title: "Kiến trúc máy tính", group: group2Users }
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
        name: `${subj.title} - HK2`,
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
        subjectCode: `SUBJ2-${code}`,
        classCode: code,
        location: "Phòng 202",
        startTime: new Date("2027-02-01T08:00:00Z"),
        endTime: new Date("2027-02-01T10:00:00Z"),
        startDate: new Date("2027-02-01"),
        session: "MORNING",
        classId: newClass.id,
        semesterId: semester2.id,
        members: {
          create: subj.group.map(uid => ({ userId: uid }))
        }
      }
    });
    console.log(`Created Subject & Class: ${subj.title} (${code})`);
  }

  console.log("Additional seeding finished successfully.");
}

main()
  .catch(e => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
