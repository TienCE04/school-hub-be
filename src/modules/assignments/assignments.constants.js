export const ASSIGNMENT_ACTIONS = Object.freeze({
  CREATED: "created",
  GRADED: "graded",
});

export const ASSIGNMENT_NOTIFICATION_KINDS = Object.freeze({
  NEW_ASSIGNMENT: "NEW_ASSIGNMENT",
  SUBMISSION_CREATED: "SUBMISSION",
  SUBMISSION_GRADED: "GRADE",
});

export const ASSIGNMENT_NOTIFICATION_MESSAGES = Object.freeze({
  NEW_ASSIGNMENT: ({ assignmentTitle }) => ({
    title: "New Assignment",
    content: `New assignment: ${assignmentTitle}`,
  }),
  SUBMISSION_CREATED: ({ studentName, assignmentTitle }) => ({
    title: "New Submission",
    content: `${studentName} submitted: ${assignmentTitle}`,
  }),
  SUBMISSION_GRADED: ({ assignmentTitle }) => ({
    title: "Assignment Graded",
    content: `Your submission for ${assignmentTitle} has been graded`,
  }),
});
