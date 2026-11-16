-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('ADMIN', 'TEACHER', 'STUDENT');

-- CreateEnum
CREATE TYPE "PostType" AS ENUM ('ANNOUNCEMENT', 'ASSIGNMENT');

-- CreateEnum
CREATE TYPE "SubmissionStatus" AS ENUM ('PENDING', 'SUBMITTED', 'LATE', 'GRADED');

-- CreateEnum
CREATE TYPE "JoinRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "ConversationType" AS ENUM ('PRIVATE', 'GROUP');

-- CreateEnum
CREATE TYPE "SessionType" AS ENUM ('MORNING', 'AFTERNOON', 'EVENING');

-- CreateEnum
CREATE TYPE "LeaveRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "AttendanceDeviceType" AS ENUM ('TEACHER_PHONE', 'ESP32');

-- CreateEnum
CREATE TYPE "AttendanceDeviceStatus" AS ENUM ('PENDING', 'ACTIVE', 'REVOKED', 'OFFLINE');

-- CreateEnum
CREATE TYPE "AttendanceSessionStatus" AS ENUM ('DRAFT', 'SCHEDULED', 'ACTIVE', 'ENDED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "AttendanceStatus" AS ENUM ('PENDING', 'PRESENT', 'LATE', 'ABSENT', 'EXCUSED', 'REVIEW', 'REJECTED');

-- CreateEnum
CREATE TYPE "AttendanceVerificationStatus" AS ENUM ('NOT_STARTED', 'VERIFYING', 'VERIFIED', 'REVIEW_REQUIRED', 'REJECTED');

-- CreateEnum
CREATE TYPE "AttendanceRecordSource" AS ENUM ('ONLINE', 'OFFLINE', 'MANUAL');

-- CreateEnum
CREATE TYPE "AttendanceAttemptStatus" AS ENUM ('PENDING_SYNC', 'RECEIVED', 'VERIFYING', 'VERIFIED', 'PENDING_REVIEW', 'REJECTED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "AttendanceEvidenceStatus" AS ENUM ('PENDING', 'VERIFIED', 'FAILED', 'REVIEW_REQUIRED');

-- CreateEnum
CREATE TYPE "AttendanceChallengeType" AS ENUM ('BLINK', 'SMILE', 'TURN_LEFT', 'TURN_RIGHT', 'NOD', 'CAPTURE');

-- CreateEnum
CREATE TYPE "FaceProfileStatus" AS ENUM ('NOT_ENROLLED', 'PENDING', 'ACTIVE', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "AttendanceReviewDecision" AS ENUM ('APPROVE', 'REJECT', 'MARK_PRESENT', 'MARK_ABSENT', 'MARK_EXCUSED');

-- CreateEnum
CREATE TYPE "ClassMemberStatus" AS ENUM ('ACTIVE', 'LEFT', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "AttendanceParticipantStatus" AS ENUM ('ACTIVE', 'REMOVED');

-- CreateEnum
CREATE TYPE "AttendanceSessionChallengeType" AS ENUM ('BLE_TOKEN', 'FACE_CHALLENGE');

-- CreateEnum
CREATE TYPE "AttendanceAuditAction" AS ENUM ('CREATE_SESSION', 'START_SESSION', 'STOP_SESSION', 'FINALIZE_SESSION', 'CREATE_ATTEMPT', 'CANCEL_ATTEMPT', 'REVIEW_RECORD', 'MANUAL_UPDATE_RECORD', 'PAIR_DEVICE', 'REVOKE_DEVICE', 'ENROLL_FACE', 'SUSPEND_FACE_PROFILE');

-- CreateTable
CREATE TABLE "User" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "studentCode" TEXT,
    "password" TEXT NOT NULL,
    "avatar" TEXT,
    "role" "Role" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Class" (
    "id" SERIAL NOT NULL,
    "semesterId" INTEGER,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "code" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Class_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClassMember" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "classId" INTEGER NOT NULL,
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" "ClassMemberStatus" NOT NULL DEFAULT 'ACTIVE',
    "leftAt" TIMESTAMP(3),

    CONSTRAINT "ClassMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClassJoinRequest" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "classId" INTEGER NOT NULL,
    "status" "JoinRequestStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClassJoinRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Post" (
    "id" SERIAL NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "type" "PostType" NOT NULL,
    "dueDate" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "authorId" INTEGER NOT NULL,
    "classId" INTEGER NOT NULL,

    CONSTRAINT "Post_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Comment" (
    "id" SERIAL NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "postId" INTEGER NOT NULL,
    "authorId" INTEGER NOT NULL,

    CONSTRAINT "Comment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Submission" (
    "id" SERIAL NOT NULL,
    "submittedAt" TIMESTAMP(3),
    "grade" DOUBLE PRECISION,
    "feedback" TEXT,
    "status" "SubmissionStatus" NOT NULL DEFAULT 'PENDING',
    "postId" INTEGER NOT NULL,
    "studentId" INTEGER NOT NULL,

    CONSTRAINT "Submission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Attachment" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "size" INTEGER,
    "postId" INTEGER,
    "commentId" INTEGER,
    "submissionId" INTEGER,
    "messageId" INTEGER,

    CONSTRAINT "Attachment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Conversation" (
    "id" SERIAL NOT NULL,
    "name" TEXT,
    "avatar" TEXT,
    "type" "ConversationType" NOT NULL DEFAULT 'PRIVATE',
    "privateKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Conversation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Participant" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "conversationId" INTEGER NOT NULL,
    "lastReadAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Participant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Message" (
    "id" SERIAL NOT NULL,
    "content" TEXT NOT NULL,
    "isEdited" BOOLEAN NOT NULL DEFAULT false,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "senderId" INTEGER NOT NULL,
    "conversationId" INTEGER NOT NULL,

    CONSTRAINT "Message_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Semester" (
    "id" SERIAL NOT NULL,
    "semesterName" TEXT NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "totalWeeks" INTEGER NOT NULL,
    "weekRanges" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Semester_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Subject" (
    "id" SERIAL NOT NULL,
    "title" TEXT NOT NULL,
    "subjectCode" TEXT NOT NULL,
    "classCode" TEXT NOT NULL,
    "location" TEXT NOT NULL,
    "startTime" TIMESTAMP(3) NOT NULL,
    "endTime" TIMESTAMP(3) NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "classId" INTEGER,
    "semesterId" INTEGER NOT NULL,
    "session" "SessionType" NOT NULL,

    CONSTRAINT "Subject_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SubjectMember" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "subjectId" INTEGER NOT NULL,
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SubjectMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RefreshToken" (
    "id" SERIAL NOT NULL,
    "token" TEXT NOT NULL,
    "userId" INTEGER NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RefreshToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DriveFile" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "size" DOUBLE PRECISION NOT NULL,
    "isShared" BOOLEAN NOT NULL DEFAULT false,
    "ownerId" INTEGER NOT NULL,
    "classId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DriveFile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Profile" (
    "id" SERIAL NOT NULL,
    "phone" TEXT,
    "birthDate" TEXT,
    "story" TEXT,
    "emailPersonal" TEXT,
    "nameSchool" TEXT,
    "nameClass" TEXT,
    "major" TEXT,
    "department" TEXT,
    "title" TEXT,
    "userId" INTEGER NOT NULL,

    CONSTRAINT "Profile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeviceToken" (
    "id" SERIAL NOT NULL,
    "token" TEXT NOT NULL,
    "userId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DeviceToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeaveRequest" (
    "id" SERIAL NOT NULL,
    "studentId" INTEGER NOT NULL,
    "classId" INTEGER NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "reason" TEXT NOT NULL,
    "evidence" TEXT,
    "status" "LeaveRequestStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LeaveRequest_pkey" PRIMARY KEY ("id")
);

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

-- CreateTable
CREATE TABLE "AttendanceSession" (
    "id" SERIAL NOT NULL,
    "classId" INTEGER NOT NULL,
    "subjectId" INTEGER,
    "teacherId" INTEGER NOT NULL,
    "deviceId" INTEGER,
    "sessionCode" TEXT NOT NULL,
    "attendanceDate" DATE NOT NULL,
    "startsAt" TIMESTAMP(3),
    "reminderAt" TIMESTAMP(3),
    "reminderClaimedAt" TIMESTAMP(3),
    "reminderSentAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "endedAt" TIMESTAMP(3),
    "status" "AttendanceSessionStatus" NOT NULL DEFAULT 'DRAFT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AttendanceSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
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
    "maxAttemptSeconds" INTEGER NOT NULL DEFAULT 90,
    "bleRssiThreshold" INTEGER,
    "bleMinScanCount" INTEGER NOT NULL DEFAULT 1,
    "bleScanDurationSeconds" INTEGER NOT NULL DEFAULT 10,
    "durationMinutes" INTEGER NOT NULL DEFAULT 15,
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

-- CreateTable
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

-- CreateTable
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

-- CreateTable
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

-- CreateTable
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

-- CreateTable
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

-- CreateTable
CREATE TABLE "AttendanceSessionChallenge" (
    "id" SERIAL NOT NULL,
    "sessionId" INTEGER NOT NULL,
    "attemptId" INTEGER,
    "type" "AttendanceSessionChallengeType" NOT NULL,
    "faceAction" "AttendanceChallengeType",
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

-- CreateTable
CREATE TABLE "FaceProfile" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "status" "FaceProfileStatus" NOT NULL DEFAULT 'NOT_ENROLLED',
    "modelName" TEXT,
    "modelVersion" TEXT,
    "consentAt" TIMESTAMP(3),
    "enrolledAt" TIMESTAMP(3),
    "consentVersion" TEXT,
    "consentRevokedAt" TIMESTAMP(3),
    "retentionExpiresAt" TIMESTAMP(3),
    "revokedReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FaceProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FaceEmbeddingSample" (
    "id" SERIAL NOT NULL,
    "profileId" INTEGER NOT NULL,
    "embedding" JSONB NOT NULL,
    "dimension" INTEGER NOT NULL,
    "modelName" TEXT NOT NULL,
    "modelVersion" TEXT NOT NULL,
    "sampleType" TEXT,
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

-- CreateTable
CREATE TABLE "AttendanceReview" (
    "id" SERIAL NOT NULL,
    "recordId" INTEGER NOT NULL,
    "reviewerId" INTEGER NOT NULL,
    "decision" "AttendanceReviewDecision" NOT NULL,
    "note" TEXT,
    "previousStatus" "AttendanceStatus",
    "newStatus" "AttendanceStatus",
    "previousVerificationStatus" "AttendanceVerificationStatus",
    "newVerificationStatus" "AttendanceVerificationStatus",
    "reasonCode" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AttendanceReview_pkey" PRIMARY KEY ("id")
);

-- CreateTable
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
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "User_studentCode_key" ON "User"("studentCode");

-- CreateIndex
CREATE UNIQUE INDEX "Class_code_key" ON "Class"("code");

-- CreateIndex
CREATE INDEX "Class_semesterId_idx" ON "Class"("semesterId");

-- CreateIndex
CREATE INDEX "ClassMember_classId_status_idx" ON "ClassMember"("classId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "ClassMember_userId_classId_key" ON "ClassMember"("userId", "classId");

-- CreateIndex
CREATE UNIQUE INDEX "ClassJoinRequest_userId_classId_key" ON "ClassJoinRequest"("userId", "classId");

-- CreateIndex
CREATE UNIQUE INDEX "Submission_studentId_postId_key" ON "Submission"("studentId", "postId");

-- CreateIndex
CREATE UNIQUE INDEX "Conversation_privateKey_key" ON "Conversation"("privateKey");

-- CreateIndex
CREATE INDEX "Conversation_updatedAt_idx" ON "Conversation"("updatedAt");

-- CreateIndex
CREATE INDEX "Participant_conversationId_idx" ON "Participant"("conversationId");

-- CreateIndex
CREATE UNIQUE INDEX "Participant_userId_conversationId_key" ON "Participant"("userId", "conversationId");

-- CreateIndex
CREATE INDEX "Message_conversationId_createdAt_idx" ON "Message"("conversationId", "createdAt");

-- CreateIndex
CREATE INDEX "Message_senderId_idx" ON "Message"("senderId");

-- CreateIndex
CREATE UNIQUE INDEX "Subject_classId_key" ON "Subject"("classId");

-- CreateIndex
CREATE UNIQUE INDEX "SubjectMember_userId_subjectId_key" ON "SubjectMember"("userId", "subjectId");

-- CreateIndex
CREATE UNIQUE INDEX "RefreshToken_token_key" ON "RefreshToken"("token");

-- CreateIndex
CREATE UNIQUE INDEX "Profile_userId_key" ON "Profile"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "DeviceToken_token_key" ON "DeviceToken"("token");

-- CreateIndex
CREATE INDEX "LeaveRequest_studentId_idx" ON "LeaveRequest"("studentId");

-- CreateIndex
CREATE INDEX "LeaveRequest_classId_idx" ON "LeaveRequest"("classId");

-- CreateIndex
CREATE UNIQUE INDEX "AttendanceDevice_deviceKey_key" ON "AttendanceDevice"("deviceKey");

-- CreateIndex
CREATE INDEX "AttendanceDevice_ownerId_status_idx" ON "AttendanceDevice"("ownerId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "AttendanceSession_sessionCode_key" ON "AttendanceSession"("sessionCode");

-- CreateIndex
CREATE INDEX "AttendanceSession_classId_attendanceDate_idx" ON "AttendanceSession"("classId", "attendanceDate");

-- CreateIndex
CREATE INDEX "AttendanceSession_teacherId_startsAt_idx" ON "AttendanceSession"("teacherId", "startsAt");

-- CreateIndex
CREATE INDEX "AttendanceSession_status_expiresAt_idx" ON "AttendanceSession"("status", "expiresAt");

-- CreateIndex
CREATE INDEX "AttendanceSession_status_reminderAt_idx" ON "AttendanceSession"("status", "reminderAt");

-- CreateIndex
CREATE UNIQUE INDEX "AttendanceSessionConfig_sessionId_key" ON "AttendanceSessionConfig"("sessionId");

-- CreateIndex
CREATE INDEX "AttendanceSessionParticipant_sessionId_status_idx" ON "AttendanceSessionParticipant"("sessionId", "status");

-- CreateIndex
CREATE INDEX "AttendanceSessionParticipant_studentId_createdAt_idx" ON "AttendanceSessionParticipant"("studentId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "AttendanceSessionParticipant_sessionId_studentId_key" ON "AttendanceSessionParticipant"("sessionId", "studentId");

-- CreateIndex
CREATE INDEX "AttendanceRecord_sessionId_status_idx" ON "AttendanceRecord"("sessionId", "status");

-- CreateIndex
CREATE INDEX "AttendanceRecord_studentId_createdAt_idx" ON "AttendanceRecord"("studentId", "createdAt");

-- CreateIndex
CREATE INDEX "AttendanceRecord_leaveRequestId_idx" ON "AttendanceRecord"("leaveRequestId");

-- CreateIndex
CREATE UNIQUE INDEX "AttendanceRecord_sessionId_studentId_key" ON "AttendanceRecord"("sessionId", "studentId");

-- CreateIndex
CREATE UNIQUE INDEX "AttendanceAttempt_clientAttemptId_key" ON "AttendanceAttempt"("clientAttemptId");

-- CreateIndex
CREATE INDEX "AttendanceAttempt_recordId_createdAt_idx" ON "AttendanceAttempt"("recordId", "createdAt");

-- CreateIndex
CREATE INDEX "AttendanceAttempt_status_serverReceivedAt_idx" ON "AttendanceAttempt"("status", "serverReceivedAt");

-- CreateIndex
CREATE INDEX "AttendanceAttempt_clientDeviceId_idx" ON "AttendanceAttempt"("clientDeviceId");

-- CreateIndex
CREATE UNIQUE INDEX "AttendanceBleEvidence_attemptId_key" ON "AttendanceBleEvidence"("attemptId");

-- CreateIndex
CREATE INDEX "AttendanceBleEvidence_advertisedDeviceKey_idx" ON "AttendanceBleEvidence"("advertisedDeviceKey");

-- CreateIndex
CREATE INDEX "AttendanceBleEvidence_status_createdAt_idx" ON "AttendanceBleEvidence"("status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "AttendanceFaceVerification_attemptId_key" ON "AttendanceFaceVerification"("attemptId");

-- CreateIndex
CREATE INDEX "AttendanceSessionChallenge_sessionId_type_expiresAt_idx" ON "AttendanceSessionChallenge"("sessionId", "type", "expiresAt");

-- CreateIndex
CREATE INDEX "AttendanceSessionChallenge_challengeHash_idx" ON "AttendanceSessionChallenge"("challengeHash");

-- CreateIndex
CREATE INDEX "AttendanceSessionChallenge_attemptId_idx" ON "AttendanceSessionChallenge"("attemptId");

-- CreateIndex
CREATE UNIQUE INDEX "FaceProfile_userId_key" ON "FaceProfile"("userId");

-- CreateIndex
CREATE INDEX "FaceEmbeddingSample_profileId_isActive_idx" ON "FaceEmbeddingSample"("profileId", "isActive");

-- CreateIndex
CREATE INDEX "AttendanceReview_recordId_createdAt_idx" ON "AttendanceReview"("recordId", "createdAt");

-- CreateIndex
CREATE INDEX "AttendanceReview_reviewerId_createdAt_idx" ON "AttendanceReview"("reviewerId", "createdAt");

-- CreateIndex
CREATE INDEX "AttendanceAuditLog_sessionId_createdAt_idx" ON "AttendanceAuditLog"("sessionId", "createdAt");

-- CreateIndex
CREATE INDEX "AttendanceAuditLog_actorId_createdAt_idx" ON "AttendanceAuditLog"("actorId", "createdAt");

-- CreateIndex
CREATE INDEX "AttendanceAuditLog_entityType_entityId_idx" ON "AttendanceAuditLog"("entityType", "entityId");

-- AddForeignKey
ALTER TABLE "Class" ADD CONSTRAINT "Class_semesterId_fkey" FOREIGN KEY ("semesterId") REFERENCES "Semester"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClassMember" ADD CONSTRAINT "ClassMember_classId_fkey" FOREIGN KEY ("classId") REFERENCES "Class"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClassMember" ADD CONSTRAINT "ClassMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClassJoinRequest" ADD CONSTRAINT "ClassJoinRequest_classId_fkey" FOREIGN KEY ("classId") REFERENCES "Class"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClassJoinRequest" ADD CONSTRAINT "ClassJoinRequest_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Post" ADD CONSTRAINT "Post_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Post" ADD CONSTRAINT "Post_classId_fkey" FOREIGN KEY ("classId") REFERENCES "Class"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Comment" ADD CONSTRAINT "Comment_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Comment" ADD CONSTRAINT "Comment_postId_fkey" FOREIGN KEY ("postId") REFERENCES "Post"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Submission" ADD CONSTRAINT "Submission_postId_fkey" FOREIGN KEY ("postId") REFERENCES "Post"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Submission" ADD CONSTRAINT "Submission_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_commentId_fkey" FOREIGN KEY ("commentId") REFERENCES "Comment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "Message"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_postId_fkey" FOREIGN KEY ("postId") REFERENCES "Post"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "Submission"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Participant" ADD CONSTRAINT "Participant_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Participant" ADD CONSTRAINT "Participant_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Subject" ADD CONSTRAINT "Subject_classId_fkey" FOREIGN KEY ("classId") REFERENCES "Class"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Subject" ADD CONSTRAINT "Subject_semesterId_fkey" FOREIGN KEY ("semesterId") REFERENCES "Semester"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubjectMember" ADD CONSTRAINT "SubjectMember_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "Subject"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubjectMember" ADD CONSTRAINT "SubjectMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RefreshToken" ADD CONSTRAINT "RefreshToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DriveFile" ADD CONSTRAINT "DriveFile_classId_fkey" FOREIGN KEY ("classId") REFERENCES "Class"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DriveFile" ADD CONSTRAINT "DriveFile_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Profile" ADD CONSTRAINT "Profile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeviceToken" ADD CONSTRAINT "DeviceToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeaveRequest" ADD CONSTRAINT "LeaveRequest_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeaveRequest" ADD CONSTRAINT "LeaveRequest_classId_fkey" FOREIGN KEY ("classId") REFERENCES "Class"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttendanceDevice" ADD CONSTRAINT "AttendanceDevice_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttendanceSession" ADD CONSTRAINT "AttendanceSession_classId_fkey" FOREIGN KEY ("classId") REFERENCES "Class"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttendanceSession" ADD CONSTRAINT "AttendanceSession_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "Subject"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttendanceSession" ADD CONSTRAINT "AttendanceSession_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttendanceSession" ADD CONSTRAINT "AttendanceSession_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "AttendanceDevice"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttendanceSessionConfig" ADD CONSTRAINT "AttendanceSessionConfig_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "AttendanceSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttendanceSessionParticipant" ADD CONSTRAINT "AttendanceSessionParticipant_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "AttendanceSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttendanceSessionParticipant" ADD CONSTRAINT "AttendanceSessionParticipant_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttendanceSessionParticipant" ADD CONSTRAINT "AttendanceSessionParticipant_classMemberId_fkey" FOREIGN KEY ("classMemberId") REFERENCES "ClassMember"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttendanceRecord" ADD CONSTRAINT "AttendanceRecord_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "AttendanceSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttendanceRecord" ADD CONSTRAINT "AttendanceRecord_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttendanceRecord" ADD CONSTRAINT "AttendanceRecord_leaveRequestId_fkey" FOREIGN KEY ("leaveRequestId") REFERENCES "LeaveRequest"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttendanceRecord" ADD CONSTRAINT "AttendanceRecord_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttendanceAttempt" ADD CONSTRAINT "AttendanceAttempt_recordId_fkey" FOREIGN KEY ("recordId") REFERENCES "AttendanceRecord"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttendanceBleEvidence" ADD CONSTRAINT "AttendanceBleEvidence_attemptId_fkey" FOREIGN KEY ("attemptId") REFERENCES "AttendanceAttempt"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttendanceFaceVerification" ADD CONSTRAINT "AttendanceFaceVerification_attemptId_fkey" FOREIGN KEY ("attemptId") REFERENCES "AttendanceAttempt"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttendanceSessionChallenge" ADD CONSTRAINT "AttendanceSessionChallenge_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "AttendanceSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttendanceSessionChallenge" ADD CONSTRAINT "AttendanceSessionChallenge_attemptId_fkey" FOREIGN KEY ("attemptId") REFERENCES "AttendanceAttempt"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FaceProfile" ADD CONSTRAINT "FaceProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FaceEmbeddingSample" ADD CONSTRAINT "FaceEmbeddingSample_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "FaceProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttendanceReview" ADD CONSTRAINT "AttendanceReview_recordId_fkey" FOREIGN KEY ("recordId") REFERENCES "AttendanceRecord"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttendanceReview" ADD CONSTRAINT "AttendanceReview_reviewerId_fkey" FOREIGN KEY ("reviewerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttendanceAuditLog" ADD CONSTRAINT "AttendanceAuditLog_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttendanceAuditLog" ADD CONSTRAINT "AttendanceAuditLog_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "AttendanceSession"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Preserve the attendance time-order check from the original migration history.
ALTER TABLE "AttendanceSessionChallenge"
    ADD CONSTRAINT "AttendanceSessionChallenge_time_order_check"
    CHECK ("expiresAt" > "issuedAt");
