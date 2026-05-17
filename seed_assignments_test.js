import prisma from "./src/config/prisma.js";

async function main() {
  console.log("Seeding comprehensive test assignments and submissions...");

  // Find student 1 and teacher 1
  const student = await prisma.user.findFirst({ where: { email: "s1@school.com" } });
  const teacher = await prisma.user.findFirst({ where: { email: "t1@school.com" } });

  if (!student || !teacher) {
    console.error("Could not find student (s1@school.com) or teacher (t1@school.com). Run npm run seed first!");
    return;
  }

  // Get a class that has student 1 as a member
  const classObj = await prisma.class.findFirst({
    where: {
      members: {
        some: { userId: student.id }
      }
    }
  });

  if (!classObj) {
    console.error("Could not find a class containing student 1. Run npm run seed first!");
    return;
  }

  console.log(`Found Class for testing: ${classObj.name} (Code: ${classObj.code})`);

  // Clean up existing posts of type ASSIGNMENT and submissions to avoid duplicates / clutter
  const deletedSubmissions = await prisma.submission.deleteMany({
    where: { studentId: student.id }
  });
  console.log(`Deleted ${deletedSubmissions.count} existing submissions for student.`);

  const deletedAssignments = await prisma.post.deleteMany({
    where: { type: "ASSIGNMENT", classId: classObj.id }
  });
  console.log(`Deleted ${deletedAssignments.count} existing assignments in test class.`);

  // 1. Upcoming Assignment - NOT SUBMITTED
  const a1UpcomingNoSub = await prisma.post.create({
    data: {
      title: "Bài tập lớn lập trình Socket.io",
      content: "Lập trình ứng dụng chat sử dụng Socket.io trong Android và nộp báo cáo.",
      type: "ASSIGNMENT",
      dueDate: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000), // due in 5 days
      authorId: teacher.id,
      classId: classObj.id
    }
  });
  console.log(`Created [Upcoming - Not Submitted]: "${a1UpcomingNoSub.title}"`);

  // 2. Upcoming Assignment - SUBMITTED ON TIME
  const a2UpcomingWithSub = await prisma.post.create({
    data: {
      title: "Thiết kế giao diện UI/UX cho App",
      content: "Vẽ mockup giao diện quản lý lớp học bằng Figma và xuất link nộp bài.",
      type: "ASSIGNMENT",
      dueDate: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000), // due in 3 days
      authorId: teacher.id,
      classId: classObj.id
    }
  });
  console.log(`Created [Upcoming - Ready to Submit]: "${a2UpcomingWithSub.title}"`);

  // Create submission on time for a2
  await prisma.submission.create({
    data: {
      submittedAt: new Date(),
      status: "SUBMITTED",
      postId: a2UpcomingWithSub.id,
      studentId: student.id,
      attachments: {
        create: [
          {
            name: "mockup_figma.png",
            url: "https://res.cloudinary.com/demo/image/upload/v123456/mockup_figma.png",
            mimeType: "image/png",
            size: 452000
          }
        ]
      }
    }
  });
  console.log(`-> Added [On-Time Submission] for student s1.`);

  // 3. Past Due Assignment - NOT SUBMITTED (MISSING)
  const a3PastDueNoSub = await prisma.post.create({
    data: {
      title: "Bài tập giải tích tuần 2",
      content: "Tính giới hạn và đạo hàm các hàm số trang 15 sách giáo khoa.",
      type: "ASSIGNMENT",
      dueDate: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000), // due 2 days ago
      authorId: teacher.id,
      classId: classObj.id
    }
  });
  console.log(`Created [Past Due - Not Submitted]: "${a3PastDueNoSub.title}"`);

  // 4. Past Due Assignment - SUBMITTED LATE
  const a4PastDueWithSub = await prisma.post.create({
    data: {
      title: "Báo cáo tiểu luận Vật lý",
      content: "Viết tiểu luận về ứng dụng của vật lý bán dẫn trong linh kiện điện tử.",
      type: "ASSIGNMENT",
      dueDate: new Date(Date.now() - 4 * 24 * 60 * 60 * 1000), // due 4 days ago
      authorId: teacher.id,
      classId: classObj.id
    }
  });
  console.log(`Created [Past Due - Ready to Submit Late]: "${a4PastDueWithSub.title}"`);

  // Create late submission for a4
  await prisma.submission.create({
    data: {
      submittedAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000), // submitted 3 days ago (1 day late)
      status: "LATE",
      postId: a4PastDueWithSub.id,
      studentId: student.id,
      grade: 8.5,
      feedback: "Tốt, tuy nhiên nộp muộn nên bị trừ điểm nhẹ.",
      attachments: {
        create: [
          {
            name: "tieu_luan_vat_ly.pdf",
            url: "https://res.cloudinary.com/demo/image/upload/v123456/tieu_luan_vat_ly.pdf",
            mimeType: "application/pdf",
            size: 1048000
          }
        ]
      }
    }
  });
  console.log(`-> Added [Late Submission with Grade] for student s1.`);

  console.log("\nAll mock assignments and submissions seeded successfully!");
}

main()
  .catch(e => {
    console.error("Error seeding test assignments:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
