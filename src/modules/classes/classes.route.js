import * as controller from './classes.controller.js';
import { authenticate } from "../../shared/middleware/auth.middleware.js";
import { authorize } from "../../shared/middleware/role.middleware.js";
import express from 'express';

const router = express.Router();

router.get('/:id', authenticate, controller.getClassById);
router.get('/:id/members', authenticate, controller.getClassMembers);
router.post('/', authenticate, authorize(['TEACHER']), controller.createNewClass);
router.post('/posts', authenticate, authorize(['TEACHER','STUDENT']), controller.createNewPost);
router.get('/:classId/posts/:postId/stats', authenticate, authorize(['TEACHER']), controller.getAssignmentStats);
router.get(
  "/:classId/assignments",
  authenticate,
  controller.getAssignments
);

export default router;