import Redis from "ioredis";

const REDIS_URL = process.env.REDIS_URL || "redis://localhost:6379";

export const pubClient = new Redis(REDIS_URL);
export const subClient = pubClient.duplicate();

pubClient.on("error", (err) => {
  console.error("Redis pubClient Error", err);
});

subClient.on("error", (err) => {
  console.error("Redis subClient Error", err);
});
