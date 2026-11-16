import test from "node:test";
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { once } from "node:events";
import bcrypt from "bcrypt";
import express from "express";
import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";

test("attendance from teacher scheduling through student history", async (t) => {
  const db = await PGlite.create();
  await db.exec(await readFile(new URL("./fixtures/schema.sql", import.meta.url), "utf8"));
  const pg = new PGLiteSocketServer({ db, host: "127.0.0.1", port: 0 });
  await pg.start();
  process.env.DATABASE_URL = "postgres://postgres@" + pg.getServerConn() + "/postgres";
  process.env.JWT_SECRET = randomUUID();
  process.env.JWT_REFRESH_SECRET = randomUUID();
  process.env.ATTENDANCE_FACE_ENCRYPTION_KEY_BASE64 = randomBytes(32).toString("base64");
  process.env.ATTENDANCE_FACE_SIMILARITY_THRESHOLD = "0.85";
  process.env.REDIS_URL = "redis://127.0.0.1:1";
  // PGlite's PostgreSQL wire server multiplexes one database connection.
  process.env.DATABASE_POOL_MAX = "1";
  process.env.DATABASE_POOL_IDLE_TIMEOUT_MS = "0";
  const { default: prisma, pool } = await import("../src/config/prisma.js");
  const { default: attendance } = await import("../src/modules/attendance/attendance.route.js");
  const { default: auth } = await import("../src/modules/auth/auth.route.js");
  const { pubClient, subClient } = await import("../src/realtime/redis.js");
  pubClient.disconnect();
  subClient.disconnect();
  const app = express().use(express.json()).use("/api/auth", auth).use("/api/attendance", attendance);
  const api = app.listen(0, "127.0.0.1");
  await once(api, "listening");
  t.after(async () => {
    await new Promise(resolve => api.close(resolve));
    await prisma.$disconnect();
    // Prisma leaves externally supplied pg pools under the caller's ownership.
    await pool.end();
    await pg.stop();
    await db.close();
  });
  const base = "http://127.0.0.1:" + api.address().port + "/api/";
  async function request(method, path, token, body, expected = 200) {
    const response = await fetch(base + path, {
      method, headers: { "Content-Type": "application/json", ...(token && { Authorization: "Bearer " + token }) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const result = await response.json();
    assert.equal(response.status, expected, method + " " + path + " " + (result.message ?? ""));
    return result;
  }
  const clock = Date.parse("2026-11-16T03:00:00Z");
  t.mock.timers.enable({ apis: ["Date"], now: clock });
  const password = randomUUID();
  const passwordHash = await bcrypt.hash(password, 4);
  async function account(name, role) {
    const user = await prisma.user.create({ data: { name, email: name + "@example.test", password: passwordHash, role } });
    const login = await request("POST", "auth/login", null, { email: user.email, password });
    return { id: user.id, token: login.accessToken };
  }
  const teacher = await account("teacher", "TEACHER");
  const students = [];
  for (const name of ["present", "late", "review", "manual", "absent"]) students.push(await account(name, "STUDENT"));
  const [present, late, review, manual, absent] = students;
  const outsider = await account("outside", "STUDENT");
  const semester = await prisma.semester.create({ data: {
    semesterName: "Test", startDate: new Date("2026-11-01"), endDate: new Date("2026-12-01"),
    totalWeeks: 4, weekRanges: [{ startWeek: 1, endWeek: 4 }],
  } });
  const cls = await prisma.class.create({ data: {
    name: "Attendance test", code: "E2E", semesterId: semester.id,
    members: { create: [teacher, ...students].map(({ id }) => ({ userId: id })) },
  } });
  const subject = await prisma.subject.create({ data: {
    classId: cls.id, semesterId: semester.id, subjectCode: "S1", classCode: cls.code, title: "Test",
    location: "101", startDate: new Date(clock), startTime: new Date("2026-11-16T02:00:00Z"),
    endTime: new Date("2026-11-16T06:00:00Z"), session: "MORNING",
  } });
  const call = (user, method, path, body, status) => request(method, "attendance/" + path, user.token, body, status);
  const device = await call(teacher, "POST", "devices/register", { clientDeviceId: randomUUID() }, 201);
  const config = { requireFace: true, requireBle: true, faceLivenessRequired: true, lateAfterMinutes: 5, allowManualReview: true };
  const draft = await call(teacher, "POST", "classes/" + cls.id + "/sessions",
    { subjectId: subject.id, deviceId: device.id, startMode: "MANUAL", config }, 201);
  const session = await call(teacher, "POST", "classes/" + cls.id + "/sessions",
    { subjectId: subject.id, deviceId: device.id, startMode: "SCHEDULED", startsAt: new Date(clock + 600000), config }, 201);
  const path = "sessions/" + session.id;
  const mine = "my/" + path;
  const schedule = user => call(user, "GET", "my/reminder-schedule");
  const relay = (user, method = "POST", status = 201) =>
    call(user, method, path + "/my/relay-beacon", undefined, status);
  let relayBeacon;
  await t.test("only relevant scheduled sessions reach each role", async () => {
    for (const user of [teacher, present]) {
      assert.deepEqual((await schedule(user)).map(s => s.sessionId), [session.id]);
    }
    assert.deepEqual(await schedule(outsider), []);
    assert.equal(draft.status, "DRAFT");
    assert.equal((await call(present, "GET", mine)).checkInAvailable, false);
    await relay(teacher, "POST", 403);
    await call(present, "POST", path + "/start", undefined, 403);
  });
  t.mock.timers.setTime(clock + 600000);
  const { startDueAttendanceSessions, finalizeExpiredAttendanceSessions } = await import("../src/modules/attendance/attendance.session-lifecycle.service.js");
  await startDueAttendanceSessions();
  let broadcast = (await call(teacher, "POST", path + "/ble-token")).bleBroadcast;
  const getRecords = () => call(teacher, "GET", path + "/records");
  const template = Array.from({ length: 128 }, (_, i) => i === 0 ? 1 : 0);
  const mismatch = template.slice().reverse();
  const faceModel = { modelName: "MobileFaceNet", modelVersion: "qualcomm-ai-hub-v0.65.0-float", dimension: 128 };
  const attempt = (user, id = randomUUID(), status = 201) => call(user, "POST", path + "/attempts", { clientAttemptId: id }, status);
  const scan = (user, id, count = 3, beacon = broadcast) => call(user, "POST", "attempts/" + id + "/ble-evidence", {
    advertisedSessionCode: beacon.sessionCode, token: beacon.token, scanCount: count, scanDurationMs: 8000,
  });
  async function verify(user, embedding, beacon = broadcast) {
    const { attemptId } = await attempt(user);
    const { faceChallenge } = await scan(user, attemptId, 3, beacon);
    const evidence = { ...faceModel, challengeNonce: faceChallenge.nonce, completedChallengeType: faceChallenge.type,
      probeEmbedding: embedding, livenessPassed: true };
    const send = () => call(user, "POST", "attempts/" + attemptId + "/evidence", evidence);
    const result = await send();
    assert.equal((await send()).attendanceStatus, result.attendanceStatus);
    return result.attendanceStatus;
  }
  await t.test("opening captures the class roster and requires an enrolled face", async () => {
    assert.deepEqual(await schedule(present), []);
    assert.equal((await getRecords()).summary.PENDING, 5);
    assert.equal((await relay(present, "POST", 409)).error.code, "RELAY_ATTENDANCE_REQUIRED");
    assert.equal((await attempt(present, randomUUID(), 409)).error.code, "FACE_PROFILE_REQUIRED");
    await call(outsider, "GET", mine, undefined, 404);
    for (const user of [present, late, review, manual]) {
      await call(user, "POST", "my/face-profile/consent",
        { consentVersion: "test", purposes: ["ATTENDANCE_FACE_VERIFICATION"] }, 201);
      await call(user, "POST", "my/face-profile/enrollment",
        { samples: [{ ...faceModel, sampleType: "PROFILE_AVATAR", embedding: template }] }, 201);
    }
  });
  await t.test("failed scans can be retried and never grant attendance", async () => {
    for (let n = 0; n < 3; n++) {
      const key = randomUUID();
      const { attemptId } = await attempt(manual, key);
      assert.equal((await attempt(manual, key, 200)).attemptId, attemptId);
      assert.equal((await scan(manual, attemptId, 1)).code, "BLE_SCAN_INSUFFICIENT");
    }
    const detail = await call(manual, "GET", mine);
    assert.equal(detail.attendanceStatus, "PENDING");
    assert.equal(detail.attemptCount, 3);
    assert.ok(detail.recentAttempts.every(a => a.status === "REJECTED"));
  });
  await t.test("face match, manual review and late arrival", async () => {
    assert.equal(await verify(present, template), "PRESENT");
    relayBeacon = await relay(present);
    assert.equal(relayBeacon.sessionCode, broadcast.sessionCode);
    assert.ok(relayBeacon.token);
    assert.equal(await verify(review, mismatch), "REVIEW");
    assert.equal((await relay(review, "POST", 409)).error.code, "RELAY_ATTENDANCE_REQUIRED");
    t.mock.timers.setTime(clock + 960000);
    const expiredRelayAttempt = await attempt(late);
    assert.equal((await scan(late, expiredRelayAttempt.attemptId, 3, relayBeacon)).code, "BLE_TOKEN_INVALID");
    relayBeacon = await relay(present);
    assert.equal(await verify(late, template, relayBeacon), "LATE");
    const revoked = await relay(present, "DELETE", 200);
    assert.ok(revoked.revokedCount >= 1);
    const { attemptId } = await attempt(manual);
    assert.equal((await scan(manual, attemptId, 3, relayBeacon)).code, "BLE_TOKEN_INVALID");
  });
  await t.test("closing, teacher correction and student history agree", async () => {
    assert.equal((await call(teacher, "POST", path + "/end")).absentCount, 2);
    const rows = (await getRecords()).records;
    const record = user => "records/" + rows.find(row => row.studentId === user.id).recordId;
    await call(teacher, "PATCH", record(manual) + "/manual-check-in", { note: "Confirmed in class" });
    await call(teacher, "PATCH", record(review) + "/review", { decision: "MARK_PRESENT", note: "Confirmed in class" });
    await relay(present, "POST", 409);
    for (const [user, expected] of [[manual, "PRESENT"], [review, "PRESENT"], [absent, "ABSENT"], [late, "LATE"]]) {
      const detail = await call(user, "GET", mine);
      assert.equal(detail.attendanceStatus, expected);
      if (user === manual || user === review) assert.equal(detail.source, "MANUAL");
      const history = await call(user, "GET", "my/sessions");
      assert.equal(history.find(s => s.sessionId === session.id).myAttendanceStatus, expected);
    }
    const stats = await call(teacher, "GET", "classes/" + cls.id + "/students");
    assert.equal(stats.students.reduce((n, s) => n + s.countCheckIn, 0), 4);
    assert.equal((await attempt(manual, randomUUID(), 409)).error.code, "SESSION_NOT_ACTIVE");
  });
  await t.test("manual start returns its actual expiry and expiry finalizes absences", async () => {
    const opened = await call(teacher, "POST", "sessions/" + draft.id + "/start");
    assert.equal(Date.parse(opened.sessionExpiresAt), Date.now() + 15 * 60000);
    t.mock.timers.setTime(Date.parse(opened.sessionExpiresAt) + 1000);
    assert.equal(await finalizeExpiredAttendanceSessions(), 1);
    assert.equal((await call(teacher, "GET", "sessions/" + draft.id + "/records")).summary.ABSENT, 5);
  });
});
