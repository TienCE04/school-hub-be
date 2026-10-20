-- Attendance foundation for BLE proximity, face verification, manual review,
-- and offline attempts synchronized by the Android app.

-- CreateEnum
CREATE TYPE "AttendanceDeviceType" AS ENUM ('TEACHER_PHONE', 'ESP32');
CREATE TYPE "AttendanceDeviceStatus" AS ENUM ('PENDING', 'ACTIVE', 'REVOKED', 'OFFLINE');
CREATE TYPE "AttendanceSessionStatus" AS ENUM ('DRAFT', 'SCHEDULED', 'ACTIVE', 'ENDED', 'CANCELLED');
CREATE TYPE "AttendanceStatus" AS ENUM ('PENDING', 'PRESENT', 'LATE', 'ABSENT', 'EXCUSED', 'REVIEW', 'REJECTED');
CREATE TYPE "AttendanceVerificationStatus" AS ENUM ('NOT_STARTED', 'VERIFYING', 'VERIFIED', 'REVIEW_REQUIRED', 'REJECTED');
CREATE TYPE "AttendanceRecordSource" AS ENUM ('ONLINE', 'OFFLINE', 'MANUAL');
CREATE TYPE "AttendanceAttemptStatus" AS ENUM ('PENDING_SYNC', 'RECEIVED', 'VERIFYING', 'VERIFIED', 'PENDING_REVIEW', 'REJECTED', 'EXPIRED');
CREATE TYPE "AttendanceEvidenceStatus" AS ENUM ('PENDING', 'VERIFIED', 'FAILED', 'REVIEW_REQUIRED');
CREATE TYPE "AttendanceChallengeType" AS ENUM ('BLINK', 'SMILE', 'TURN_LEFT', 'TURN_RIGHT', 'NOD');
CREATE TYPE "FaceProfileStatus" AS ENUM ('NOT_ENROLLED', 'PENDING', 'ACTIVE', 'SUSPENDED');
CREATE TYPE "AttendanceReviewDecision" AS ENUM ('APPROVE', 'REJECT', 'MARK_PRESENT', 'MARK_ABSENT', 'MARK_EXCUSED');

-- CreateTable
CREATE TABLE "AttendanceDevice" (
    "id" SERIAL NOT NULL,
    "deviceKey" TEXT NOT NULL,
    "name" TEXT,
    "type" "AttendanceDeviceType" NOT NULL DEFAULT 'TEACHER_PHONE',
    "status" "AttendanceDeviceStatus" NOT NULL DEFAULT 'ACTIVE',
    "ownerId" INTEGER NOT NULL,
    "secretHash" TEXT,
    "firmwareVersion" TEXT,
    "lastSeenAt" TIMESTAMP(3),
    "pairedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AttendanceDevice_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AttendanceSession" (
    "id" SERIAL NOT NULL,
    "classId" INTEGER NOT NULL,
    "subjectId" INTEGER,
    "teacherId" INTEGER NOT NULL,
    "deviceId" INTEGER,
    "sessionCode" TEXT NOT NULL,
    "attendanceDate" DATE NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "endedAt" TIMESTAMP(3),
    "status" "AttendanceSessionStatus" NOT NULL DEFAULT 'DRAFT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AttendanceSession_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AttendanceSessionConfig" (
    "id" SERIAL NOT NULL,
    "sessionId" INTEGER NOT NULL,
    "requireBle" BOOLEAN NOT NULL DEFAULT true,
    "requireFace" BOOLEAN NOT NULL DEFAULT true,
    "faceLivenessRequired" BOOLEAN NOT NULL DEFAULT true,
    "allowLate" BOOLEAN NOT NULL DEFAULT true,
    "allowManualReview" BOOLEAN NOT NULL DEFAULT true,
    "allowOfflineAttempt" BOOLEAN NOT NULL DEFAULT true,
    "lateAfterMinutes" INTEGER NOT NULL DEFAULT 0,
    "maxAttemptSeconds" INTEGER NOT NULL DEFAULT 30,
    "bleRssiThreshold" INTEGER,
    "bleMinScanCount" INTEGER NOT NULL DEFAULT 1,
    "bleScanDurationSeconds" INTEGER NOT NULL DEFAULT 10,
    "faceSimilarityThreshold" DOUBLE PRECISION,
    "faceLivenessChallengeSeconds" INTEGER NOT NULL DEFAULT 30,
    "bleTokenHash" TEXT,
    "bleTokenExpiresAt" TIMESTAMP(3),
    "bleStartedAt" TIMESTAMP(3),
    "bleStoppedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AttendanceSessionConfig_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AttendanceRecord" (
    "id" SERIAL NOT NULL,
    "sessionId" INTEGER NOT NULL,
    "studentId" INTEGER NOT NULL,
    "leaveRequestId" INTEGER,
    "status" "AttendanceStatus" NOT NULL DEFAULT 'PENDING',
    "verificationStatus" "AttendanceVerificationStatus" NOT NULL DEFAULT 'NOT_STARTED',
    "source" "AttendanceRecordSource" NOT NULL DEFAULT 'ONLINE',
    "attemptedAt" TIMESTAMP(3),
    "checkedInAt" TIMESTAMP(3),
    "finalScore" DOUBLE PRECISION,
    "note" TEXT,
    "reviewedById" INTEGER,
    "reviewedAt" TIMESTAMP(3),
    "reviewNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AttendanceRecord_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AttendanceAttempt" (
    "id" SERIAL NOT NULL,
    "recordId" INTEGER NOT NULL,
    "clientAttemptId" TEXT NOT NULL,
    "status" "AttendanceAttemptStatus" NOT NULL DEFAULT 'PENDING_SYNC',
    "source" "AttendanceRecordSource" NOT NULL DEFAULT 'ONLINE',
    "clientDeviceId" TEXT,
    "clientRecordedAt" TIMESTAMP(3),
    "initiatedAt" TIMESTAMP(3),
    "submittedAt" TIMESTAMP(3),
    "serverReceivedAt" TIMESTAMP(3),
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "locationAccuracyM" DOUBLE PRECISION,
    "networkType" TEXT,
    "errorCode" TEXT,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AttendanceAttempt_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AttendanceBleEvidence" (
    "id" SERIAL NOT NULL,
    "attemptId" INTEGER NOT NULL,
    "advertisedDeviceKey" TEXT,
    "advertisedSessionCode" TEXT,
    "tokenFingerprint" TEXT,
    "rssiMin" INTEGER,
    "rssiMax" INTEGER,
    "rssiAverage" DOUBLE PRECISION,
    "scanCount" INTEGER NOT NULL DEFAULT 0,
    "scanDurationMs" INTEGER,
    "firstSeenAt" TIMESTAMP(3),
    "lastSeenAt" TIMESTAMP(3),
    "status" "AttendanceEvidenceStatus" NOT NULL DEFAULT 'PENDING',
    "verifiedAt" TIMESTAMP(3),
    "failureReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AttendanceBleEvidence_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AttendanceFaceVerification" (
    "id" SERIAL NOT NULL,
    "attemptId" INTEGER NOT NULL,
    "challengeType" "AttendanceChallengeType",
    "challengeHash" TEXT,
    "challengeExpiresAt" TIMESTAMP(3),
    "modelName" TEXT,
    "modelVersion" TEXT,
    "embeddingDimension" INTEGER,
    "similarityScore" DOUBLE PRECISION,
    "livenessScore" DOUBLE PRECISION,
    "qualityScore" DOUBLE PRECISION,
    "status" "AttendanceEvidenceStatus" NOT NULL DEFAULT 'PENDING',
    "evidenceUrl" TEXT,
    "processedAt" TIMESTAMP(3),
    "failureReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AttendanceFaceVerification_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "FaceProfile" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "status" "FaceProfileStatus" NOT NULL DEFAULT 'NOT_ENROLLED',
    "modelName" TEXT,
    "modelVersion" TEXT,
    "consentAt" TIMESTAMP(3),
    "enrolledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FaceProfile_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "FaceEmbeddingSample" (
    "id" SERIAL NOT NULL,
    "profileId" INTEGER NOT NULL,
    "embedding" JSONB NOT NULL,
    "dimension" INTEGER NOT NULL,
    "modelName" TEXT NOT NULL,
    "modelVersion" TEXT NOT NULL,
    "qualityScore" DOUBLE PRECISION,
    "yaw" DOUBLE PRECISION,
    "pitch" DOUBLE PRECISION,
    "roll" DOUBLE PRECISION,
    "sourceUrl" TEXT,
    "capturedAt" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FaceEmbeddingSample_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AttendanceReview" (
    "id" SERIAL NOT NULL,
    "recordId" INTEGER NOT NULL,
    "reviewerId" INTEGER NOT NULL,
    "decision" "AttendanceReviewDecision" NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AttendanceReview_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AttendanceDevice_deviceKey_key" ON "AttendanceDevice"("deviceKey");
CREATE INDEX "AttendanceDevice_ownerId_status_idx" ON "AttendanceDevice"("ownerId", "status");
CREATE UNIQUE INDEX "AttendanceSession_sessionCode_key" ON "AttendanceSession"("sessionCode");
CREATE INDEX "AttendanceSession_classId_attendanceDate_idx" ON "AttendanceSession"("classId", "attendanceDate");
CREATE INDEX "AttendanceSession_teacherId_startsAt_idx" ON "AttendanceSession"("teacherId", "startsAt");
CREATE INDEX "AttendanceSession_status_expiresAt_idx" ON "AttendanceSession"("status", "expiresAt");
CREATE UNIQUE INDEX "AttendanceSessionConfig_sessionId_key" ON "AttendanceSessionConfig"("sessionId");
CREATE UNIQUE INDEX "AttendanceRecord_sessionId_studentId_key" ON "AttendanceRecord"("sessionId", "studentId");
CREATE INDEX "AttendanceRecord_sessionId_status_idx" ON "AttendanceRecord"("sessionId", "status");
CREATE INDEX "AttendanceRecord_studentId_createdAt_idx" ON "AttendanceRecord"("studentId", "createdAt");
CREATE INDEX "AttendanceRecord_leaveRequestId_idx" ON "AttendanceRecord"("leaveRequestId");
CREATE UNIQUE INDEX "AttendanceAttempt_clientAttemptId_key" ON "AttendanceAttempt"("clientAttemptId");
CREATE INDEX "AttendanceAttempt_recordId_createdAt_idx" ON "AttendanceAttempt"("recordId", "createdAt");
CREATE INDEX "AttendanceAttempt_status_serverReceivedAt_idx" ON "AttendanceAttempt"("status", "serverReceivedAt");
CREATE INDEX "AttendanceAttempt_clientDeviceId_idx" ON "AttendanceAttempt"("clientDeviceId");
CREATE UNIQUE INDEX "AttendanceBleEvidence_attemptId_key" ON "AttendanceBleEvidence"("attemptId");
CREATE INDEX "AttendanceBleEvidence_advertisedDeviceKey_idx" ON "AttendanceBleEvidence"("advertisedDeviceKey");
CREATE INDEX "AttendanceBleEvidence_status_createdAt_idx" ON "AttendanceBleEvidence"("status", "createdAt");
CREATE UNIQUE INDEX "AttendanceFaceVerification_attemptId_key" ON "AttendanceFaceVerification"("attemptId");
CREATE UNIQUE INDEX "FaceProfile_userId_key" ON "FaceProfile"("userId");
CREATE INDEX "FaceEmbeddingSample_profileId_isActive_idx" ON "FaceEmbeddingSample"("profileId", "isActive");
CREATE INDEX "AttendanceReview_recordId_createdAt_idx" ON "AttendanceReview"("recordId", "createdAt");
CREATE INDEX "AttendanceReview_reviewerId_createdAt_idx" ON "AttendanceReview"("reviewerId", "createdAt");

-- AddForeignKey
ALTER TABLE "AttendanceDevice" ADD CONSTRAINT "AttendanceDevice_ownerId_fkey"
  FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AttendanceSession" ADD CONSTRAINT "AttendanceSession_classId_fkey"
  FOREIGN KEY ("classId") REFERENCES "Class"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AttendanceSession" ADD CONSTRAINT "AttendanceSession_subjectId_fkey"
  FOREIGN KEY ("subjectId") REFERENCES "Subject"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AttendanceSession" ADD CONSTRAINT "AttendanceSession_teacherId_fkey"
  FOREIGN KEY ("teacherId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AttendanceSession" ADD CONSTRAINT "AttendanceSession_deviceId_fkey"
  FOREIGN KEY ("deviceId") REFERENCES "AttendanceDevice"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AttendanceSessionConfig" ADD CONSTRAINT "AttendanceSessionConfig_sessionId_fkey"
  FOREIGN KEY ("sessionId") REFERENCES "AttendanceSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AttendanceRecord" ADD CONSTRAINT "AttendanceRecord_sessionId_fkey"
  FOREIGN KEY ("sessionId") REFERENCES "AttendanceSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AttendanceRecord" ADD CONSTRAINT "AttendanceRecord_studentId_fkey"
  FOREIGN KEY ("studentId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AttendanceRecord" ADD CONSTRAINT "AttendanceRecord_leaveRequestId_fkey"
  FOREIGN KEY ("leaveRequestId") REFERENCES "LeaveRequest"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AttendanceRecord" ADD CONSTRAINT "AttendanceRecord_reviewedById_fkey"
  FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AttendanceAttempt" ADD CONSTRAINT "AttendanceAttempt_recordId_fkey"
  FOREIGN KEY ("recordId") REFERENCES "AttendanceRecord"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AttendanceBleEvidence" ADD CONSTRAINT "AttendanceBleEvidence_attemptId_fkey"
  FOREIGN KEY ("attemptId") REFERENCES "AttendanceAttempt"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AttendanceFaceVerification" ADD CONSTRAINT "AttendanceFaceVerification_attemptId_fkey"
  FOREIGN KEY ("attemptId") REFERENCES "AttendanceAttempt"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FaceProfile" ADD CONSTRAINT "FaceProfile_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FaceEmbeddingSample" ADD CONSTRAINT "FaceEmbeddingSample_profileId_fkey"
  FOREIGN KEY ("profileId") REFERENCES "FaceProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AttendanceReview" ADD CONSTRAINT "AttendanceReview_recordId_fkey"
  FOREIGN KEY ("recordId") REFERENCES "AttendanceRecord"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AttendanceReview" ADD CONSTRAINT "AttendanceReview_reviewerId_fkey"
  FOREIGN KEY ("reviewerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
