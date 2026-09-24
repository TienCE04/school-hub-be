const toIso = (value) => (value ? new Date(value).toISOString() : null);

export const toPublicUserDto = (user) => ({
  id: user.id,
  name: user.name,
  avatar: user.avatar || "",
  email: user.email,
  role: user.role,
});

export const toSubmissionDto = (submission) => ({
  id: submission.id,
  student: toPublicUserDto(submission.student),
  submittedAt: toIso(submission.submittedAt),
  attachments: submission.attachments || [],
  grade: submission.grade,
  feedback: submission.feedback,
  status: submission.status,
});

export const toStudentAssignmentDetailDto = (assignment, submission) => ({
  id: assignment.id,
  title: assignment.title,
  content: assignment.content,
  dueDate: toIso(assignment.dueDate),
  classCode: assignment.class.code,
  className: assignment.class.name,
  submission: submission
    ? {
        id: submission.id,
        submittedAt: toIso(submission.submittedAt),
        grade: submission.grade,
        feedback: submission.feedback,
        status: submission.status,
        postId: submission.postId,
        studentId: submission.studentId,
      }
    : null,
});

export const toTeacherAssignmentDetailDto = (assignment, stats, students) => ({
  assignment: {
    id: assignment.id,
    title: assignment.title,
    content: assignment.content,
    dueDate: toIso(assignment.dueDate),
    classId: assignment.class.id,
    classCode: assignment.class.code,
    className: assignment.class.name,
    author: toPublicUserDto(assignment.author),
  },
  stats,
  students,
});
