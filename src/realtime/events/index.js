export const SOCKET_EVENTS = {
  // connection
  CONNECT: 'connect',
  DISCONNECT: 'disconnect',
  JOIN_ROOM: 'join_room',
  LEAVE_ROOM: 'leave_room',
  
  // custom events
  POST_CREATED: 'post_created',
  POST_UPDATED: 'post_updated',
  POST_DELETED: 'post_deleted',

  ASSIGNMENT_CREATED: 'assignment_created',
  ASSIGNMENT_UPDATED: 'assignment_updated',
  ASSIGNMENT_DELETED: 'assignment_deleted',

  SUBMISSION_CREATED: 'submission_created',
  SUBMISSION_UPDATED: 'submission_updated',
  SUBMISSION_GRADED: 'submission_graded',

  COMMENT_ADDED: 'comment_added',
  COMMENT_DELETED: 'comment_deleted',

  MESSAGE_RECEIVED: 'message_received',
  MESSAGE_SENT: 'message_sent',
  MESSAGE_DELETED: 'message_deleted',
  CONVERSATION_CREATED: 'conversation_created',

  CLASS_JOIN_REQUESTED: 'class_join_requested',
  CLASS_JOIN_APPROVED: 'class_join_approved',
  CLASS_JOIN_REJECTED: 'class_join_rejected',
  MEMBER_ADDED: 'member_added',
  MEMBER_REMOVED: 'member_removed',

  NOTIFICATION_RECEIVED: 'notification_received',
};
