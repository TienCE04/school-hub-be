import express from "express";

import authRoute from "./modules/auth/auth.route.js";
import assignmentRoute from "./modules/assignments/assignments.route.js";
import classRoute from "./modules/classes/classes.route.js";
import scheduleRoute from "./modules/schedule/schedule.route.js";
import messageRoute from "./modules/messages/messages.route.js";

const app = express();

app.use(express.json());

// Auth
app.use("/api/auth", authRoute);

// Assignments
app.use("/api/assignments", assignmentRoute);

// Classes
app.use("/api/classes", classRoute);

// Schedule
app.use("/api/schedule", scheduleRoute);

// Messages
app.use("/api/messages", messageRoute);

export default app;