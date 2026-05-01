import express from "express";

import authRoute from "./modules/auth/auth.route.js";
import assignmentRoute from "./modules/assignments/assignments.route.js";
import classRoute from "./modules/classes/classes.route.js";
import scheduleRoute from "./modules/schedule/schedule.route.js";
import messageRoute from "./modules/messages/messages.route.js";
import driveRoute from "./modules/drive/drive.route.js";
import profileRoute from "./modules/profile/profile.route.js";

const app = express();

app.use(express.json());

// Auth
app.use("/api/auth", authRoute);

// Profile
app.use("/api/profile", profileRoute);

// Assignments
app.use("/api/assignments", assignmentRoute);

// Classes
app.use("/api/classes", classRoute);

// Schedule
app.use("/api/schedule", scheduleRoute);

// Messages
app.use("/api/messages", messageRoute);

// Drive Storage
app.use("/api/drive", driveRoute);

export default app;