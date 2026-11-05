ALTER TABLE "Class" ADD COLUMN "semesterId" INTEGER;

UPDATE "Class" AS c
SET "semesterId" = s."semesterId"
FROM "Subject" AS s
WHERE s."classId" = c."id";

CREATE INDEX "Class_semesterId_idx" ON "Class"("semesterId");

ALTER TABLE "Class" ADD CONSTRAINT "Class_semesterId_fkey"
FOREIGN KEY ("semesterId") REFERENCES "Semester"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
