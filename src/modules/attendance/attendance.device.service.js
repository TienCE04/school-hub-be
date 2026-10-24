import prisma from "../../config/prisma.js";
import { hashToken } from "../../shared/utils/hash.js";
import {
  addAuditLog, badRequest, conflict, notFound, parseRequiredId, toDeviceDto,
} from "./attendance.service.shared.js";

export const registerTeacherDevice = async (user, body = {}) => {
  const clientDeviceId = String(body.clientDeviceId || "").trim();
  if (!/^[A-Za-z0-9._:-]{8,128}$/.test(clientDeviceId)) {
    throw badRequest("clientDeviceId must be 8-128 characters");
  }

  const name = String(body.name || "Điện thoại giảng viên").trim();
  const appVersion = body.appVersion == null ? null : String(body.appVersion).trim();
  if (!name || name.length > 80) throw badRequest("name must be 1-80 characters");
  if (appVersion && appVersion.length > 40) throw badRequest("appVersion must be at most 40 characters");

  // The installation ID is never stored directly. Hashing it with the owner ID
  // makes retries idempotent for one teacher while keeping installations distinct.
  const deviceKey = hashToken(`attendance-device:${user.id}:${clientDeviceId}`);
  const existing = await prisma.attendanceDevice.findUnique({ where: { deviceKey } });
  if (existing) {
    if (existing.ownerId !== user.id) throw conflict("DEVICE_KEY_CONFLICT", "Device key is already registered");
    if (existing.status === "REVOKED") {
      throw conflict("DEVICE_REVOKED", "Thiết bị đã bị thu hồi; hãy đăng ký lại bằng mã cài đặt mới");
    }
    const refreshed = existing.status === "ACTIVE"
      ? existing
      : await prisma.$transaction(async (tx) => {
        const updated = await tx.attendanceDevice.update({
          where: { id: existing.id },
          data: {
            status: "ACTIVE",
            name,
            firmwareVersion: appVersion,
            pairedAt: new Date(),
          },
        });
        await addAuditLog(tx, {
          actorId: user.id,
          action: "PAIR_DEVICE",
          entityType: "AttendanceDevice",
          entityId: updated.id,
          metadata: { type: updated.type, reactivated: true },
        });
        return updated;
      });
    return { ...toDeviceDto(refreshed), idempotent: true };
  }

  try {
    const device = await prisma.$transaction(async (tx) => {
      const created = await tx.attendanceDevice.create({
        data: {
          deviceKey,
          name,
          type: "TEACHER_PHONE",
          status: "ACTIVE",
          ownerId: user.id,
          firmwareVersion: appVersion,
          pairedAt: new Date(),
        },
      });
      await addAuditLog(tx, {
        actorId: user.id,
        action: "PAIR_DEVICE",
        entityType: "AttendanceDevice",
        entityId: created.id,
        metadata: { type: created.type },
      });
      return created;
    });
    return { ...toDeviceDto(device), idempotent: false };
  } catch (error) {
    if (error.code !== "P2002") throw error;
    const concurrentRegistration = await prisma.attendanceDevice.findUnique({ where: { deviceKey } });
    if (concurrentRegistration?.ownerId === user.id && concurrentRegistration.status === "ACTIVE") {
      return { ...toDeviceDto(concurrentRegistration), idempotent: true };
    }
    throw error;
  }
};

export const getMyTeacherDevices = async (userId) => {
  const devices = await prisma.attendanceDevice.findMany({
    where: { ownerId: userId },
    orderBy: [{ status: "asc" }, { createdAt: "desc" }],
  });
  return devices.map(toDeviceDto);
};

export const revokeTeacherDevice = async (user, rawDeviceId) => {
  const deviceId = parseRequiredId(rawDeviceId, "deviceId");
  const device = await prisma.attendanceDevice.findUnique({ where: { id: deviceId } });
  if (!device || (user.role !== "ADMIN" && device.ownerId !== user.id)) {
    throw notFound("Không tìm thấy thiết bị");
  }
  if (device.status === "REVOKED") return { deviceId, status: "REVOKED" };

  const activeSessions = await prisma.attendanceSession.count({
    where: { deviceId, status: "ACTIVE" },
  });
  if (activeSessions > 0) {
    throw conflict("DEVICE_IN_ACTIVE_SESSION", "Không thể thu hồi thiết bị đang phát trong phiên hoạt động");
  }

  await prisma.$transaction(async (tx) => {
    await tx.attendanceDevice.update({
      where: { id: deviceId },
      data: { status: "REVOKED" },
    });
    await addAuditLog(tx, {
      actorId: user.id,
      action: "REVOKE_DEVICE",
      entityType: "AttendanceDevice",
      entityId: deviceId,
      metadata: { previousStatus: device.status },
    });
  });
  return { deviceId, status: "REVOKED" };
};
