ALTER TABLE "AttendanceSession" ALTER COLUMN "startsAt" DROP NOT NULL;
UPDATE "AttendanceSession" SET "status" = 'SCHEDULED'
WHERE "status" = 'DRAFT' AND "startsAt" > CURRENT_TIMESTAMP;
