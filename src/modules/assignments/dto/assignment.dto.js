export const createAssignmentDto = (data) => {
  const { title, content, classId, dueDate, attachments } = data;
  if (!title || !content || !classId || !dueDate) {
    throw new Error("Missing title, content, classId or dueDate");
  }

  return {
    title,
    content,
    type: "ASSIGNMENT",
    classId: Number(classId),
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
