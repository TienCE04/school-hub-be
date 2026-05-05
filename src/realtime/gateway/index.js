import { Server } from "socket.io";
import { createAdapter } from "@socket.io/redis-adapter";
import { pubClient, subClient } from "../redis.js";
import { SOCKET_EVENTS } from "../events/index.js";
import { verifyToken } from "../../shared/utils/jwt.js";
import prisma from "../../config/prisma.js";

let io;

export const initSocket = (server) => {
  io = new Server(server, {
    cors: {
      origin: "*", // Adjust this based on your frontend URL in production
      methods: ["GET", "POST"]
    }
  });

  // Setup Redis Adapter
  try {
    io.adapter(createAdapter(pubClient, subClient));
    console.log("Redis adapter for Socket.io configured");
  } catch (err) {
    console.error("Error setting up Redis adapter:", err);
  }

  // Authentication Middleware
  io.use((socket, next) => {
    const token = socket.handshake.auth?.token || socket.handshake.headers?.authorization?.split(' ')[1];
    if (!token) {
      return next(new Error("Authentication error: No token provided"));
    }

    try {
      const decoded = verifyToken(token);
      socket.user = decoded;
      next();
    } catch (err) {
      return next(new Error("Authentication error: Invalid token"));
    }
  });

  io.on(SOCKET_EVENTS.CONNECT, async (socket) => {
    console.log(`User connected: ${socket.user?.id} (Socket ID: ${socket.id})`);

    // Join a room specific to the user for direct messages/notifications
    if (socket.user?.id) {
      socket.join(`user:${socket.user.id}`);

      try {
        const userWithClasses = await prisma.user.findUnique({
          where: { id: socket.user.id },
          include: { classMembers: { include: { class: true } } }
        });

        if (userWithClasses?.classMembers) {
          userWithClasses.classMembers.forEach(cm => {
            socket.join(`class:${cm.class.id}`);
          });
        }
      } catch (err) {
        console.error("Error joining class rooms:", err);
      }
    }

    socket.on(SOCKET_EVENTS.DISCONNECT, () => {
      console.log(`User disconnected: ${socket.user?.id} (Socket ID: ${socket.id})`);
    });
  });

  return io;
};

export const getIO = () => {
  if (!io) {
    throw new Error("Socket.io is not initialized!");
  }
  return io;
};
