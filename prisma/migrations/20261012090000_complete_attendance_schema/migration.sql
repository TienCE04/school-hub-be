-- Complete attendance schema for roster snapshots, rotating challenges,
-- membership lifecycle, review audit, and biometric consent metadata.

-- CreateEnum
CREATE TYPE "ClassMemberStatus" AS ENUM ('ACTIVE', 'LEFT', 'SUSPENDED');
CREATE TYPE "AttendanceParticipantStatus" AS ENUM ('ACTIVE', 'REMOVED');
CREATE TYPE "AttendanceSessionChallengeType" AS ENUM ('BLE_TOKEN', 'FACE_CHALLENGE');
CREATE TYPE "AttendanceAuditAction" AS ENUM (
    'CREATE_SESSION',
    'START_SESSION',
    'STOP_SESSION',
    'FINALIZE_SESSION',
    'CREATE_ATTEMPT',
    'REVIEW_RECORD',
    'MANUAL_UPDATE_RECORD',
    'PAIR_DEVICE',
    'REVOKE_DEVICE',
    'ENROLL_FACE',
    'SUSPEND_FACE_PROFILE'
);

-- Extend existing membership, biometric profile, and review records.
ALTER TABLE "ClassMember"
    ADD COLUMN "status" "ClassMemberStatus" NOT NULL DEFAULT 'ACTIVE',
    ADD COLUMN "leftAt" TIMESTAMP(3);

ALTER TABLE "FaceProfile"
    ADD COLUMN "consentVersion" TEXT,
    ADD COLUMN "consentRevokedAt" TIMESTAMP(3),
    ADD COLUMN "retentionExpiresAt" TIMESTAMP(3),
    ADD COLUMN "revokedReason" TEXT;

ALTER TABLE "AttendanceReview"
    ADD COLUMN "previousStatus" "AttendanceStatus",
    ADD COLUMN "newStatus" "AttendanceStatus",
    ADD COLUMN "previousVerificationStatus" "AttendanceVerificationStatus",
    ADD COLUMN "newVerificationStatus" "AttendanceVerificationStatus",
    ADD COLUMN "reasonCode" TEXT;

-- Snapshot of the class roster at session creation time.
CREATE TABLE "AttendanceSessionParticipant" (
    "id" SERIAL NOT NULL,
    "sessionId" INTEGER NOT NULL,
    "studentId" INTEGER NOT NULL,
    "classMemberId" INTEGER,
    "studentCodeSnapshot" TEXT,
    "studentNameSnapshot" TEXT,
    "status" "AttendanceParticipantStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AttendanceSessionParticipant_pkey" PRIMARY KEY ("id")
);

-- History of BLE tokens and one-time face challenges issued for a session.
CREATE TABLE "AttendanceSessionChallenge" (
    "id" SERIAL NOT NULL,
    "sessionId" INTEGER NOT NULL,
    "attemptId" INTEGER,
    "type" "AttendanceSessionChallengeType" NOT NULL,
    "challengeHash" TEXT NOT NULL,
    "tokenFingerprint" TEXT,
    "nonce" TEXT,
    "issuedAt" TIMESTAMP(3) NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "singleUse" BOOLEAN NOT NULL DEFAULT false,
    "consumedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AttendanceSessionChallenge_pkey" PRIMARY KEY ("id")
);

-- Attendance-specific audit trail.
CREATE TABLE "AttendanceAuditLog" (
    "id" SERIAL NOT NULL,
    "actorId" INTEGER,
    "sessionId" INTEGER,
    "action" "AttendanceAuditAction" NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" INTEGER,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AttendanceAuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ClassMember_classId_status_idx" ON "ClassMember"("classId", "status");
CREATE UNIQUE INDEX "AttendanceSessionParticipant_sessionId_studentId_key"
    ON "AttendanceSessionParticipant"("sessionId", "studentId");
CREATE INDEX "AttendanceSessionParticipant_sessionId_status_idx"
    ON "AttendanceSessionParticipant"("sessionId", "status");
CREATE INDEX "AttendanceSessionParticipant_studentId_createdAt_idx"
    ON "AttendanceSessionParticipant"("studentId", "createdAt");
CREATE INDEX "AttendanceSessionChallenge_sessionId_type_expiresAt_idx"
    ON "AttendanceSessionChallenge"("sessionId", "type", "expiresAt");
CREATE INDEX "AttendanceSessionChallenge_challengeHash_idx"
    ON "AttendanceSessionChallenge"("challengeHash");
CREATE INDEX "AttendanceSessionChallenge_attemptId_idx"
    ON "AttendanceSessionChallenge"("attemptId");
CREATE INDEX "AttendanceAuditLog_sessionId_createdAt_idx"
    ON "AttendanceAuditLog"("sessionId", "createdAt");
CREATE INDEX "AttendanceAuditLog_actorId_createdAt_idx"
    ON "AttendanceAuditLog"("actorId", "createdAt");
CREATE INDEX "AttendanceAuditLog_entityType_entityId_idx"
    ON "AttendanceAuditLog"("entityType", "entityId");

-- Preserve historical roster data for sessions that already exist.
INSERT INTO "AttendanceSessionParticipant" (
    "sessionId",
    "studentId",
    "classMemberId",
    "studentCodeSnapshot",
    "studentNameSnapshot",
    "status",
    "createdAt",
    "updatedAt"
)
SELECT
    s."id",
    cm."userId",
    cm."id",
    u."studentCode",
    u."name",
    'ACTIVE'::"AttendanceParticipantStatus",
    s."createdAt",
    s."createdAt"
FROM "AttendanceSession" s
JOIN "ClassMember" cm ON cm."classId" = s."classId"
JOIN "User" u ON u."id" = cm."userId"
WHERE cm."status" = 'ACTIVE'::"ClassMemberStatus"
  AND u."role" = 'STUDENT'::"Role"
  AND NOT EXISTS (
      SELECT 1
      FROM "AttendanceSessionParticipant" p
      WHERE p."sessionId" = s."id"
        AND p."studentId" = cm."userId"
  );

-- Validate challenge timestamps at the database boundary.
ALTER TABLE "AttendanceSessionChallenge"
    ADD CONSTRAINT "AttendanceSessionChallenge_time_order_check"
    CHECK ("expiresAt" > "issuedAt");

-- AddForeignKey
ALTER TABLE "AttendanceSessionParticipant"
    ADD CONSTRAINT "AttendanceSessionParticipant_sessionId_fkey"
    FOREIGN KEY ("sessionId") REFERENCES "AttendanceSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AttendanceSessionParticipant"
    ADD CONSTRAINT "AttendanceSessionParticipant_studentId_fkey"
    FOREIGN KEY ("studentId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AttendanceSessionParticipant"
    ADD CONSTRAINT "AttendanceSessionParticipant_classMemberId_fkey"
    FOREIGN KEY ("classMemberId") REFERENCES "ClassMember"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AttendanceSessionChallenge"
    ADD CONSTRAINT "AttendanceSessionChallenge_sessionId_fkey"
    FOREIGN KEY ("sessionId") REFERENCES "AttendanceSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AttendanceSessionChallenge"
    ADD CONSTRAINT "AttendanceSessionChallenge_attemptId_fkey"
    FOREIGN KEY ("attemptId") REFERENCES "AttendanceAttempt"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AttendanceAuditLog"
    ADD CONSTRAINT "AttendanceAuditLog_actorId_fkey"
    FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AttendanceAuditLog"
    ADD CONSTRAINT "AttendanceAuditLog_sessionId_fkey"
    FOREIGN KEY ("sessionId") REFERENCES "AttendanceSession"("id") ON DELETE SET NULL ON UPDATE CASCADE;
