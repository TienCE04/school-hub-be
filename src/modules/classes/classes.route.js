import * as controller from './classes.controller.js';
import { authenticate } from "../../shared/middleware/auth.middleware.js";
import { authorize } from "../../shared/middleware/role.middleware.js";
import express from 'express';

const router = express.Router();

router.get('/', authenticate, controller.getMyClasses);
router.post('/join', authenticate, controller.joinClass);
router.get('/:classCode', authenticate, controller.getClassByCode);
router.get('/:classCode/members', authenticate, controller.getClassMembers);
router.post('/', authenticate, authorize(['TEACHER', 'ADMIN']), controller.createNewClass);
router.post('/posts', authenticate, authorize(['TEACHER','STUDENT']), controller.createNewPost);
router.get('/posts/:postId', authenticate, controller.getPostById);
router.get('/:classCode/posts/:postId/stats', authenticate, authorize(['TEACHER']), controller.getAssignmentStats);
router.get(
  "/:classCode/assignments",
  authenticate,
  controller.getAssignments
);

export default router;