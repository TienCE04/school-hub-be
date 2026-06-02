import * as controller from "./messages.controller.js";
import { authenticate } from "../../shared/middleware/auth.middleware.js";
import { authorize } from "../../shared/middleware/role.middleware.js";
import express from 'express';

const router = express.Router();

router.get('/conversations', authenticate, controller.getConversations);
router.get('/conversations/:id/messages', authenticate, controller.getMessages);
router.put('/conversations/:id/read', authenticate, controller.markAsRead);
router.post('/messages', authenticate, authorize(['TEACHER','STUDENT']), controller.postMessage);

export default router;