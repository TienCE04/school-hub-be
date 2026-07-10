import * as controller from "./messages.controller.js";
import { authenticate } from "../../shared/middleware/auth.middleware.js";
import { authorize } from "../../shared/middleware/role.middleware.js";
import express from 'express';

const router = express.Router();

router.get('/conversations', authenticate, controller.getConversations);
router.get('/conversations/private', authenticate, controller.getOrCreatePrivateConversation);
router.get('/conversations/:id', authenticate, controller.getConversationById);
router.get('/conversations/:id/messages', authenticate, controller.getMessages);
router.put('/conversations/:id/read', authenticate, controller.markAsRead);
router.post('/messages', authenticate, authorize(['TEACHER','STUDENT']), controller.postMessage);
router.patch('/messages/:id', authenticate, controller.patchMessage);
router.delete('/messages/:id', authenticate, controller.deleteMessage);

export default router;