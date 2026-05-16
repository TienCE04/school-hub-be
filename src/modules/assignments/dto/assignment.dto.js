export const createAssignmentDto = (data) => {
  const { title, content, classCode, dueDate, attachments } = data;
  if (!title || !content || !classCode || !dueDate) {
    throw new Error("Missing title, content, classCode or dueDate");
  }

  return {
    title,
    content,
    type: "ASSIGNMENT",
    classCode: String(classCode),
    dueDate: new Date(dueDate),
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
  if (data.grade === undefined || data.grade < 0 || data.grade > 10) {
    throw new Error("Invalid grade (must be 0-10)");
  }
  return {
    grade: parseFloat(data.grade),
    feedback: data.feedback || "",
  };
};
