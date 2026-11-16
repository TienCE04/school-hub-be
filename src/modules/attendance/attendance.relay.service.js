import prisma from "../../config/prisma.js";
import { hashToken } from "../../shared/utils/hash.js";
import { parseId } from "./attendance.checkin.shared.js";
import {
  BLE_TOKEN_ROTATE_SECONDS, BLE_TOKEN_TTL_SECONDS, conflict, createBleToken,
  notFound,
} from "./attendance.service.shared.js";

const getVerifiedRelayAttempts = (tx, sessionId, studentId) => tx.attendanceAttempt.findMany({
  where: {
    status: "VERIFIED",
    record: { is: { sessionId, studentId, status: { in: ["PRESENT", "LATE"] }, source: "ONLINE" } },
    bleEvidence: { is: { status: "VERIFIED" } },
    faceVerification: { is: { status: "VERIFIED" } },
  },
  select: { id: true },
  orderBy: { id: "desc" },
});

export const createStudentRelayBeacon = async (studentId, rawSessionId) => {
  const sessionId = parseId(rawSessionId, "sessionId");
  const now = new Date();
  return prisma.$transaction(async (tx) => {
    const session = await tx.attendanceSession.findUnique({
      where: { id: sessionId },
      include: { config: true },
    });
    if (!session) throw notFound("Không tìm thấy phiên điểm danh");
    if (session.status !== "ACTIVE" || session.startsAt > now || session.expiresAt <= now) {
      throw conflict("SESSION_NOT_ACTIVE", "Phiên điểm danh không còn nhận beacon chuyển tiếp");
    }
    if (!session.config?.requireBle || !session.config?.requireFace || session.config.bleStoppedAt) {
      throw conflict("RELAY_BLE_UNAVAILABLE", "Phiên này không hỗ trợ chuyển tiếp BLE");
    }

    const participant = await tx.attendanceSessionParticipant.findUnique({
      where: { sessionId_studentId: { sessionId, studentId } },
      select: { status: true },
    });
    if (participant?.status !== "ACTIVE") {
      throw conflict("RELAY_ATTENDANCE_REQUIRED", "Chỉ sinh viên đang hoạt động trong phiên mới có thể phát BLE");
    }

    const relayAttempts = await getVerifiedRelayAttempts(tx, sessionId, studentId);
    const relayAttempt = relayAttempts[0];
    if (!relayAttempt) {
      throw conflict("RELAY_ATTENDANCE_REQUIRED", "Chỉ sinh viên đã xác minh BLE và khuôn mặt, được ghi nhận có mặt, mới có thể phát BLE giúp bạn khác");
    }

    const token = createBleToken();
    const expiresAt = new Date(Math.min(
      now.getTime() + BLE_TOKEN_TTL_SECONDS * 1000,
      session.expiresAt.getTime(),
    ));
    const tokenHash = hashToken(token);
    await tx.attendanceSessionChallenge.create({
      data: {
        sessionId,
        attemptId: relayAttempt.id,
        type: "BLE_TOKEN",
        challengeHash: tokenHash,
        tokenFingerprint: tokenHash,
        issuedAt: now,
        expiresAt,
        singleUse: false,
      },
    });

    return {
      sessionId,
      sessionCode: session.sessionCode,
      token,
      expiresAt: expiresAt.toISOString(),
      rotateEverySeconds: BLE_TOKEN_ROTATE_SECONDS,
    };
  });
};

export const revokeStudentRelayBeacons = async (studentId, rawSessionId) => {
  const sessionId = parseId(rawSessionId, "sessionId");
  const relayAttempts = await getVerifiedRelayAttempts(prisma, sessionId, studentId);
  if (relayAttempts.length === 0) return { sessionId, revokedCount: 0 };
  const result = await prisma.attendanceSessionChallenge.updateMany({
    where: {
      sessionId,
      attemptId: { in: relayAttempts.map(({ id }) => id) },
      type: "BLE_TOKEN",
      consumedAt: null,
    },
    data: { consumedAt: new Date() },
  });
  return { sessionId, revokedCount: result.count };
};
