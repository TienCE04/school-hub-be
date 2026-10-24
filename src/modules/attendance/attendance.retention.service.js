import prisma from "../../config/prisma.js";
import { addAuditLog } from "./attendance.checkin.shared.js";

export const purgeExpiredFaceProfiles = async () => {
  const now = new Date();
  const profiles = await prisma.faceProfile.findMany({
    where: { status: "ACTIVE", retentionExpiresAt: { lte: now } },
    select: { id: true, userId: true, retentionExpiresAt: true },
  });
  let purgedCount = 0;
  for (const candidate of profiles) {
    const purged = await prisma.$transaction(async (tx) => {
      const current = await tx.faceProfile.findUnique({ where: { id: candidate.id } });
      if (!current || current.status !== "ACTIVE" || !current.retentionExpiresAt || current.retentionExpiresAt > now) {
        return false;
      }
      const deleted = await tx.faceEmbeddingSample.deleteMany({ where: { profileId: current.id } });
      await tx.faceProfile.update({
        where: { id: current.id },
        data: { status: "SUSPENDED", revokedReason: "RETENTION_EXPIRED" },
      });
      await addAuditLog(tx, {
        actorId: null,
        action: "SUSPEND_FACE_PROFILE",
        entityType: "FaceProfile",
        entityId: current.id,
        metadata: { reason: "RETENTION_EXPIRED", deletedSampleCount: deleted.count },
      });
      return true;
    });
    if (purged) purgedCount += 1;
  }
  return purgedCount;
};

export const purgeExpiredAttendanceFaceEvidence = async () => {
  const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const sessions = await prisma.attendanceSession.findMany({
    where: { endedAt: { lte: cutoff } },
    select: { id: true },
  });
  if (sessions.length === 0) return 0;
  const sessionIds = sessions.map((session) => session.id);
  const attempts = await prisma.attendanceAttempt.findMany({
    where: { record: { sessionId: { in: sessionIds } } },
    select: { id: true },
  });
  const attemptIds = attempts.map((attempt) => attempt.id);
  let clearedCount = 0;
  if (attemptIds.length > 0) {
    const cleared = await prisma.attendanceFaceVerification.updateMany({
      where: {
        attemptId: { in: attemptIds },
        OR: [
          { challengeType: { not: null } },
          { challengeHash: { not: null } },
          { challengeExpiresAt: { not: null } },
          { similarityScore: { not: null } },
          { livenessScore: { not: null } },
          { qualityScore: { not: null } },
          { evidenceUrl: { not: null } },
        ],
      },
      data: {
        challengeType: null,
        challengeHash: null,
        challengeExpiresAt: null,
        similarityScore: null,
        livenessScore: null,
        qualityScore: null,
        evidenceUrl: null,
      },
    });
    clearedCount = cleared.count;
  }
  await prisma.attendanceSessionChallenge.deleteMany({ where: { sessionId: { in: sessionIds } } });
  return clearedCount;
};
