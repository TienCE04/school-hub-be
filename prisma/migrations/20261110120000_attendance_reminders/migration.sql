ALTER TABLE "AttendanceSession"
ADD COLUMN "reminderAt" TIMESTAMP(3),
ADD COLUMN "reminderClaimedAt" TIMESTAMP(3),
ADD COLUMN "reminderSentAt" TIMESTAMP(3);

UPDATE "AttendanceSession"
SET "reminderAt" = "startsAt"
WHERE "reminderAt" IS NULL
  AND "startsAt" IS NOT NULL
  AND "status" IN ('DRAFT', 'SCHEDULED');

CREATE INDEX "AttendanceSession_status_reminderAt_idx"
ON "AttendanceSession"("status", "reminderAt");
