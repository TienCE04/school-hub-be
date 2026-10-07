import Redis from "ioredis";

const REDIS_URL = process.env.REDIS_URL || "redis://127.0.0.1:6379";

const redisOptions = {
  maxRetriesPerRequest: 3,
  retryStrategy(times) {
    return Math.min(times * 200, 3000);
  }
};

export const pubClient = new Redis(REDIS_URL, redisOptions);
export const subClient = pubClient.duplicate();

let isPubErrorLogged = false;
let isSubErrorLogged = false;

pubClient.on("connect", () => {
  console.log("Redis pubClient connected successfully");
  isPubErrorLogged = false;
});

subClient.on("connect", () => {
  console.log("Redis subClient connected successfully");
  isSubErrorLogged = false;
});

pubClient.on("error", (err) => {
  if (!isPubErrorLogged) {
    console.error("Redis pubClient Error:", err.message);
    isPubErrorLogged = true;
  }
});

subClient.on("error", (err) => {
  if (!isSubErrorLogged) {
    console.error("Redis subClient Error:", err.message);
    isSubErrorLogged = true;
  }
});

