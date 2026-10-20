ALTER TABLE "FaceEmbeddingSample"
ADD COLUMN "sampleType" TEXT;

ALTER TABLE "AttendanceSessionChallenge"
ADD COLUMN "faceAction" "AttendanceChallengeType";

ALTER TABLE "AttendanceSessionConfig"
ALTER COLUMN "maxAttemptSeconds" SET DEFAULT 90;
