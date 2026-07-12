import prisma from './src/config/prisma.js';

async function main() {
  const teacher = await prisma.user.findFirst({ where: { role: 'TEACHER' } });
  if (!teacher) {
    console.error("No teacher found!");
    return;
  }
  const userId = teacher.id;
  
  // Find the latest semester
  const semester = await prisma.semester.findFirst({
    orderBy: { startDate: 'desc' }
  });

  if (!semester) {
    console.log("No semester found!");
    return;
  }

  // Create two subjects without a classId
  const s1 = await prisma.subject.create({
    data: {
      title: 'Advanced Web Development',
      subjectCode: 'CS401',
      classCode: 'WEB' + Math.floor(1000 + Math.random() * 9000),
      location: 'Lab 2',
      startTime: new Date('2026-06-09T08:00:00Z'),
      endTime: new Date('2026-06-09T10:00:00Z'),
      startDate: new Date('2026-06-09T00:00:00Z'),
      session: 'MORNING',
      semesterId: semester.id,
      members: {
        create: [
          { userId: userId }
        ]
      }
    }
  });

  const s2 = await prisma.subject.create({
    data: {
      title: 'Machine Learning Basics',
      subjectCode: 'CS501',
      classCode: 'ML' + Math.floor(1000 + Math.random() * 9000),
      location: 'Room 101',
      startTime: new Date('2026-06-10T13:00:00Z'),
      endTime: new Date('2026-06-10T15:00:00Z'),
      startDate: new Date('2026-06-10T00:00:00Z'),
      session: 'AFTERNOON',
      semesterId: semester.id,
      members: {
        create: [
          { userId: userId }
        ]
      }
    }
  });

  console.log('Created subjects:', s1.subjectCode, s2.subjectCode);
}

main()
  .catch(e => console.error(e))
  .finally(() => prisma.$disconnect());
