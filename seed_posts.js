import prisma from "./src/config/prisma.js";

async function main() {
  console.log("Adding mock posts and assignments...");

  const teacher = await prisma.user.findFirst({ where: { email: "t1@school.com" } });
  const student = await prisma.user.findFirst({ where: { email: "s1@school.com" } });
  
  if (!teacher || !student) {
    console.log("Could not find teacher or student");
    return;
  }

  // Get first class of teacher
  const classObj = await prisma.class.findFirst({
    where: {
      members: {
        some: { userId: teacher.id }
      }
    }
  });

  if (!classObj) {
    console.log("Could not find class for teacher");
    return;
  }

  console.log(`Adding to Class Code: ${classObj.code}`);

  // Create an announcement
  const announcement = await prisma.post.create({
    data: {
      title: "Chào mừng các bạn đến với lớp Toán cao cấp",
      content: "Đây là môn học rất quan trọng, mong các bạn chuẩn bị sách vở đầy đủ.",
      type: "ANNOUNCEMENT",
      authorId: teacher.id,
      classId: classObj.id
    }
  });

  // Create an assignment
  const assignment = await prisma.post.create({
    data: {
      title: "Bài tập về nhà tuần 1",
      content: "Các em làm bài tập trong sách giáo khoa trang 12 và nộp lại trước cuối tuần.",
      type: "ASSIGNMENT",
      dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // Due in 7 days
      authorId: teacher.id,
      classId: classObj.id
    }
  });

  console.log(`Created Announcement ID: ${announcement.id}`);
  console.log(`Created Assignment ID: ${assignment.id}`);

  // Create a comment on the announcement
  await prisma.comment.create({
    data: {
      content: "Dạ vâng thưa thầy",
      postId: announcement.id,
      authorId: student.id
    }
  });

  // Create a submission for the assignment
  await prisma.submission.create({
    data: {
      submittedAt: new Date(),
      status: "SUBMITTED",
      postId: assignment.id,
      studentId: student.id
    }
  });

  console.log("Mock posts and assignments created successfully!");
}

main()
  .catch(e => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
