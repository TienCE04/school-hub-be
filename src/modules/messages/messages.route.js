import * as controller from "./messages.controller.js";
import { authenticate } from "../../shared/middleware/auth.middleware.js";
import { authorize } from "../../shared/middleware/role.middleware.js";
import express from 'express';

const router = express.Router();

router.get('/conversations', authenticate, controller.getConversations);
router.post('/messages', authenticate, authorize(['TEACHER','STUDENT']), controller.postMessage);