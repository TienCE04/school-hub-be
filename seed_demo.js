import { createHash } from "node:crypto";
import bcrypt from "bcrypt";
import prisma from "./src/config/prisma.js";

const DATABASE_NAME = "school_hub_db";
const RESET_CONFIRMATION = "SCHOOL_HUB_RESET_CONFIRM";
const DEMO_PASSWORD = "SchoolHub@2026";

const localDateTime = (date, time) => new Date(`${date}T${time}:00+07:00`);
const dateOnly = (date) => new Date(`${date}T00:00:00.000Z`);
const sha256 = (value) => createHash("sha256").update(value).digest("hex");

const userSpecs = [
  { name: "Nguyễn Minh Anh", email: "gv.anh@schoolhub.local", role: "TEACHER" },
  { name: "Trần Quốc Minh", email: "gv.minh@schoolhub.local", role: "TEACHER" },
  { name: "Nguyễn Hoàng Nam", email: "sv001@schoolhub.local", studentCode: "SV2026001", role: "STUDENT" },
  { name: "Trần Thu Hà", email: "sv002@schoolhub.local", studentCode: "SV2026002", role: "STUDENT" },
  { name: "Lê Gia Huy", email: "sv003@schoolhub.local", studentCode: "SV2026003", role: "STUDENT" },
  { name: "Phạm Ngọc Linh", email: "sv004@schoolhub.local", studentCode: "SV2026004", role: "STUDENT" },
  { name: "Vũ Đức Long", email: "sv005@schoolhub.local", studentCode: "SV2026005", role: "STUDENT" },
];

const subjectSpecs = [
  {
    title: "Lập trình Web",
    subjectCode: "WEB201",
    classCode: "WEB-2611-A",
    className: "Lớp Lập trình Web A",
    location: "Phòng B201",
    session: "MORNING",
    teacherEmail: "gv.anh@schoolhub.local",
    date: "2026-11-02",
    start: "08:00",
    end: "10:00",
  },
  {
    title: "Cơ sở dữ liệu",
    subjectCode: "DB202",
    classCode: "DB-2611-B",
    className: "Lớp Cơ sở dữ liệu B",
    location: "Phòng D101",
    session: "AFTERNOON",
    teacherEmail: "gv.anh@schoolhub.local",
    date: "2026-11-06",
    start: "13:30",
    end: "15:30",
  },
  {
    title: "Phát triển ứng dụng di động",
    subjectCode: "MOB203",
    classCode: "MOB-2611-C",
    className: "Lớp Ứng dụng di động C",
    location: "Phòng A305",
    session: "AFTERNOON",
    teacherEmail: "gv.minh@schoolhub.local",
    date: "2026-11-09",
    start: "15:00",
    end: "17:00",
  },
];

const attendanceConfig = (sessionCode, startsAt, expiresAt, ended) => ({
  requireBle: true,
  requireFace: true,
  faceLivenessRequired: true,
  allowLate: true,
  allowManualReview: true,
  allowOfflineAttempt: true,
  lateAfterMinutes: 5,
  maxAttemptSeconds: 90,
  bleRssiThreshold: -70,
  bleMinScanCount: 3,
  bleScanDurationSeconds: 8,
  durationMinutes: 15,
  faceSimilarityThreshold: 0.8,
  faceLivenessChallengeSeconds: 30,
  ...(ended
    ? {
        bleTokenHash: sha256(`demo-ble-token:${sessionCode}`),
        bleTokenExpiresAt: expiresAt,
        bleStartedAt: startsAt,
        bleStoppedAt: expiresAt,
      }
    : {}),
});

async function main() {
  if (process.env[RESET_CONFIRMATION] !== DATABASE_NAME) {
    throw new Error(
      `Refusing to reset data. Set ${RESET_CONFIRMATION}=${DATABASE_NAME} to confirm the local demo reset.`,
    );
  }

  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 10);
  const result = await prisma.$transaction(async (tx) => {
    const [{ dbName }] = await tx.$queryRawUnsafe(
      "SELECT current_database() AS \"dbName\"",
    );
    if (dbName !== DATABASE_NAME) {
      throw new Error(`Expected ${DATABASE_NAME}; connected to ${dbName}.`);
    }

    const tableRows = await tx.$queryRawUnsafe(
      "SELECT tablename FROM pg_tables WHERE schemaname = current_schema() ORDER BY tablename",
    );
    const applicationTables = tableRows
      .map(({ tablename }) => tablename)
      .filter((name) => name !== "_prisma_migrations");
    if (!tableRows.some(({ tablename }) => tablename === "_prisma_migrations")) {
      throw new Error("Prisma migration history table was not found; refusing to reset.");
    }
    if (!applicationTables.length) {
      throw new Error("No application tables were found; refusing to reset.");
    }

    const quotedTables = applicationTables
      .map((name) => `"${name.replaceAll('"', '""')}"`)
      .join(", ");
    await tx.$executeRawUnsafe(
      `TRUNCATE TABLE ${quotedTables} RESTART IDENTITY CASCADE`,
    );

    const users = {};
    for (const spec of userSpecs) {
      const user = await tx.user.create({
        data: {
          ...spec,
          password: passwordHash,
        },
      });
      users[user.email] = user;
    }

    const semester = await tx.semester.create({
      data: {
        semesterName: "Học kỳ tháng 11/2026",
        startDate: localDateTime("2026-11-01", "00:00"),
        endDate: localDateTime("2026-11-30", "23:59"),
        totalWeeks: 4,
        weekRanges: [{ startWeek: 1, endWeek: 4 }],
      },
    });

    const students = userSpecs
      .filter((user) => user.role === "STUDENT")
      .map((user) => users[user.email]);
    const teacherDevices = {};
    for (const email of ["gv.anh@schoolhub.local", "gv.minh@schoolhub.local"]) {
      teacherDevices[email] = await tx.attendanceDevice.create({
        data: {
          ownerId: users[email].id,
          deviceKey: `DEMO-DEVICE-${users[email].id}`,
          name: `Điện thoại giảng viên ${users[email].name}`,
          type: "TEACHER_PHONE",
          status: "ACTIVE",
          pairedAt: localDateTime("2026-11-01", "08:00"),
          lastSeenAt: localDateTime("2026-11-05", "08:00"),
        },
      });
    }

    const classes = {};
    const subjects = {};
    const classMemberIds = {};
    for (const spec of subjectSpecs) {
      const teacher = users[spec.teacherEmail];
      const classRecord = await tx.class.create({
        data: {
          name: spec.className,
          description: `Lớp học ${spec.title} trong học kỳ tháng 11/2026.`,
          code: spec.classCode,
          semesterId: semester.id,
          members: {
            create: [teacher, ...students].map((member) => ({
              status: "ACTIVE",
              user: { connect: { id: member.id } },
            })),
          },
        },
      });
      classes[spec.classCode] = classRecord;

      const memberRows = await tx.classMember.findMany({
        where: { classId: classRecord.id, status: "ACTIVE" },
        select: { id: true, userId: true },
      });
      classMemberIds[spec.classCode] = new Map(
        memberRows.map((row) => [row.userId, row.id]),
      );

      const subject = await tx.subject.create({
        data: {
          title: spec.title,
          subjectCode: spec.subjectCode,
          classCode: spec.classCode,
          location: spec.location,
          session: spec.session,
          startDate: localDateTime(spec.date, "00:00"),
          startTime: localDateTime(spec.date, spec.start),
          endTime: localDateTime(spec.date, spec.end),
          semesterId: semester.id,
          classId: classRecord.id,
          members: {
            create: [teacher, ...students].map((member) => ({
              user: { connect: { id: member.id } },
            })),
          },
        },
      });
      subjects[spec.classCode] = subject;
    }

    const sessionSpecs = [
      {
        code: "DEMO-ATT-20261102-WEB",
        classCode: "WEB-2611-A",
        date: "2026-11-02",
        start: "08:30",
        teacherEmail: "gv.anh@schoolhub.local",
        status: "ENDED",
      },
      {
        code: "DEMO-ATT-20261106-DB",
        classCode: "DB-2611-B",
        date: "2026-11-06",
        start: "13:45",
        teacherEmail: "gv.anh@schoolhub.local",
        status: "SCHEDULED",
      },
      {
        code: "DEMO-ATT-20261109-MOB",
        classCode: "MOB-2611-C",
        date: "2026-11-09",
        start: "15:30",
        teacherEmail: "gv.minh@schoolhub.local",
        status: "SCHEDULED",
      },
      {
        code: "DEMO-ATT-20261112-WEB",
        classCode: "WEB-2611-A",
        date: "2026-11-12",
        start: "08:30",
        teacherEmail: "gv.anh@schoolhub.local",
        status: "SCHEDULED",
      },
    ];

    let completedSession;
    for (const spec of sessionSpecs) {
      const startsAt = localDateTime(spec.date, spec.start);
      const expiresAt = new Date(startsAt.getTime() + 15 * 60 * 1000);
      const ended = spec.status === "ENDED";
      const session = await tx.attendanceSession.create({
        data: {
          classId: classes[spec.classCode].id,
          subjectId: subjects[spec.classCode].id,
          teacherId: users[spec.teacherEmail].id,
          deviceId: teacherDevices[spec.teacherEmail].id,
          sessionCode: spec.code,
          attendanceDate: dateOnly(spec.date),
          startsAt,
          expiresAt,
          endedAt: ended ? expiresAt : null,
          status: spec.status,
          config: {
            create: attendanceConfig(spec.code, startsAt, expiresAt, ended),
          },
        },
      });

      if (!ended) continue;
      completedSession = session;

      await tx.attendanceSessionParticipant.createMany({
        data: students.map((student) => ({
          sessionId: session.id,
          studentId: student.id,
          classMemberId: classMemberIds[spec.classCode].get(student.id),
          studentCodeSnapshot: student.studentCode,
          studentNameSnapshot: student.name,
          status: "ACTIVE",
          createdAt: startsAt,
          updatedAt: expiresAt,
        })),
      });

      const results = [
        { status: "PRESENT", at: "08:32" },
        { status: "PRESENT", at: "08:34" },
        { status: "PRESENT", at: "08:35" },
        { status: "LATE", at: "08:38" },
        { status: "ABSENT", at: null },
      ];
      const auditLogs = [
        { action: "CREATE_SESSION", at: startsAt },
        { action: "START_SESSION", at: startsAt },
        { action: "STOP_SESSION", at: expiresAt },
        { action: "FINALIZE_SESSION", at: expiresAt },
      ];
      for (const audit of auditLogs) {
        await tx.attendanceAuditLog.create({
          data: {
            actorId: users[spec.teacherEmail].id,
            sessionId: session.id,
            action: audit.action,
            entityType: "AttendanceSession",
            entityId: session.id,
            metadata: { sessionCode: spec.code, seeded: true },
            createdAt: audit.at,
          },
        });
      }

      for (let index = 0; index < students.length; index += 1) {
        const student = students[index];
        const outcome = results[index];
        const checkedInAt = outcome.at
          ? localDateTime(spec.date, outcome.at)
          : null;
        const record = await tx.attendanceRecord.create({
          data: {
            sessionId: session.id,
            studentId: student.id,
            status: outcome.status,
            verificationStatus: checkedInAt ? "VERIFIED" : "NOT_STARTED",
            source: "ONLINE",
            attemptedAt: checkedInAt,
            checkedInAt,
            finalScore: checkedInAt ? (outcome.status === "LATE" ? 0.91 : 0.96) : null,
            createdAt: startsAt,
            updatedAt: expiresAt,
          },
        });

        if (!checkedInAt) continue;
        const initiatedAt = new Date(checkedInAt.getTime() - 30 * 1000);
        const clientAttemptId = `DEMO-ATTEMPT-${spec.code}-${student.studentCode}`;
        const deviceKey = teacherDevices[spec.teacherEmail].deviceKey;
        const attempt = await tx.attendanceAttempt.create({
          data: {
            recordId: record.id,
            clientAttemptId,
            status: "VERIFIED",
            source: "ONLINE",
            clientDeviceId: `DEMO-STUDENT-DEVICE-${student.studentCode}`,
            clientRecordedAt: checkedInAt,
            initiatedAt,
            submittedAt: checkedInAt,
            serverReceivedAt: checkedInAt,
            networkType: "WIFI",
            createdAt: initiatedAt,
            updatedAt: checkedInAt,
            bleEvidence: {
              create: {
                advertisedDeviceKey: deviceKey,
                advertisedSessionCode: spec.code,
                tokenFingerprint: sha256(`demo-fingerprint:${spec.code}:${student.studentCode}`),
                rssiMin: -64,
                rssiMax: -48,
                rssiAverage: -56.5,
                scanCount: 5,
                scanDurationMs: 5000,
                firstSeenAt: initiatedAt,
                lastSeenAt: checkedInAt,
                status: "VERIFIED",
                verifiedAt: checkedInAt,
                createdAt: initiatedAt,
              },
            },
            faceVerification: {
              create: {
                challengeType: "BLINK",
                modelName: "demo-face-model",
                modelVersion: "1.0",
                embeddingDimension: 192,
                similarityScore: outcome.status === "LATE" ? 0.91 : 0.96,
                livenessScore: 0.95,
                qualityScore: 0.92,
                status: "VERIFIED",
                processedAt: checkedInAt,
                createdAt: initiatedAt,
              },
            },
          },
        });

        for (const challenge of [
          { type: "BLE_TOKEN", faceAction: null, suffix: "BLE" },
          { type: "FACE_CHALLENGE", faceAction: "BLINK", suffix: "FACE" },
        ]) {
          await tx.attendanceSessionChallenge.create({
            data: {
              sessionId: session.id,
              attemptId: attempt.id,
              type: challenge.type,
              faceAction: challenge.faceAction,
              challengeHash: sha256(`${clientAttemptId}:${challenge.suffix}`),
              tokenFingerprint: challenge.type === "BLE_TOKEN"
                ? sha256(`demo-fingerprint:${spec.code}:${student.studentCode}`)
                : null,
              nonce: `${student.studentCode}-${challenge.suffix.toLowerCase()}`,
              issuedAt: initiatedAt,
              expiresAt: new Date(checkedInAt.getTime() + 30 * 1000),
              singleUse: true,
              consumedAt: checkedInAt,
              createdAt: initiatedAt,
            },
          });
        }
      }
    }

    if (!completedSession) throw new Error("Completed attendance session was not created.");

    const summary = {
      users: await tx.user.count(),
      teachers: await tx.user.count({ where: { role: "TEACHER" } }),
      students: await tx.user.count({ where: { role: "STUDENT" } }),
      admins: await tx.user.count({ where: { role: "ADMIN" } }),
      semesters: await tx.semester.count(),
      classes: await tx.class.count(),
      subjects: await tx.subject.count(),
      attendanceDevices: await tx.attendanceDevice.count(),
      attendanceSessions: await tx.attendanceSession.count(),
      completedSessions: await tx.attendanceSession.count({ where: { status: "ENDED" } }),
      scheduledSessions: await tx.attendanceSession.count({ where: { status: "SCHEDULED" } }),
      attendanceParticipants: await tx.attendanceSessionParticipant.count(),
      attendanceRecords: await tx.attendanceRecord.count(),
      attendanceAttempts: await tx.attendanceAttempt.count(),
      bleEvidence: await tx.attendanceBleEvidence.count(),
      faceVerifications: await tx.attendanceFaceVerification.count(),
      attendanceChallenges: await tx.attendanceSessionChallenge.count(),
      auditLogs: await tx.attendanceAuditLog.count(),
    };

    if (
      summary.users !== 7 || summary.teachers !== 2 || summary.students !== 5 ||
      summary.admins !== 0 || summary.semesters !== 1 || summary.classes !== 3 ||
      summary.subjects !== 3 || summary.attendanceDevices !== 2 ||
      summary.attendanceSessions !== 4 || summary.completedSessions !== 1 ||
      summary.scheduledSessions !== 3 || summary.attendanceParticipants !== 5 ||
      summary.attendanceRecords !== 5 || summary.attendanceAttempts !== 4 ||
      summary.bleEvidence !== 4 || summary.faceVerifications !== 4 ||
      summary.attendanceChallenges !== 8
    ) {
      throw new Error(`Seed count mismatch; rolling back: ${JSON.stringify(summary)}`);
    }

    return summary;
  });

  console.log(JSON.stringify({
    database: DATABASE_NAME,
    reset: "application data (Prisma migration history retained)",
    seeded: result,
    login: {
      password: DEMO_PASSWORD,
      teachers: ["gv.anh@schoolhub.local", "gv.minh@schoolhub.local"],
      students: userSpecs.filter((user) => user.role === "STUDENT").map((user) => user.email),
    },
  }, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
