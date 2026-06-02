import * as controller from './classes.controller.js';
import { authenticate } from "../../shared/middleware/auth.middleware.js";
import { authorize } from "../../shared/middleware/role.middleware.js";
import express from 'express';

const router = express.Router();

router.get('/', authenticate, controller.getMyClasses);
router.post('/join', authenticate, controller.joinClass);
router.get('/:classCode', authenticate, controller.getClassByCode);
router.get('/:classCode/members', authenticate, controller.getClassMembers);
router.get('/:classCode/join-requests', authenticate, authorize(['TEACHER', 'ADMIN']), controller.getJoinRequests);
router.post('/:classCode/join-requests/:requestId/handle', authenticate, authorize(['TEACHER', 'ADMIN']), controller.handleJoinRequest);
router.post('/', authenticate, authorize(['TEACHER', 'ADMIN']), controller.createNewClass);
router.post('/posts', authenticate, authorize(['TEACHER','STUDENT']), controller.createNewPost);
router.get('/posts/:postId', authenticate, controller.getPostById);
router.put('/posts/:postId', authenticate, authorize(['TEACHER', 'STUDENT', 'ADMIN']), controller.updatePost);
router.delete('/posts/:postId', authenticate, authorize(['TEACHER', 'STUDENT', 'ADMIN']), controller.deletePost);

router.post('/posts/:postId/comments', authenticate, controller.createComment);
router.delete('/posts/:postId/comments/:commentId', authenticate, controller.deleteComment);
router.get('/:classCode/posts/:postId/stats', authenticate, authorize(['TEACHER']), controller.getAssignmentStats);
router.get(
  "/:classCode/assignments",
  authenticate,
  controller.getAssignments
);

export default router;