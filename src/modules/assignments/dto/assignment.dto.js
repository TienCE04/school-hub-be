export const createAssignmentDto = (data) => {
  const { title, content, classCode, dueDate, attachments } = data;
  if (!title || !content || !classCode || !dueDate) {
    throw new Error("Missing title, content, classCode or dueDate");
  }

  const parsedDueDate = new Date(dueDate);
  if (Number.isNaN(parsedDueDate.getTime())) {
    throw new Error("Invalid dueDate");
  }

  return {
    title,
    content,
    type: "ASSIGNMENT",
    classCode: String(classCode),
    dueDate: parsedDueDate,
    attachments: attachments || [],
  };
};

export const submitAssignmentDto = (data) => {
  if (!data.attachments || data.attachments.length === 0) {
    throw new Error("Attachments are required for submission");
  }

  return {
    attachments: data.attachments,
  };
};

export const gradeSubmissionDto = (data) => {
  const grade = Number(data.grade);
  if (!Number.isFinite(grade) || grade < 0 || grade > 10) {
    throw new Error("Invalid grade (must be 0-10)");
  }
  return {
    grade,
    feedback: data.feedback || "",
  };
};
