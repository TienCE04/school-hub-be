

export const createClassDto = (data) => {
  if (!data.name) throw new Error("Name is required");
  return {
    name: data.name,
    description: data.description || "",
    code: data.code || undefined,
  };
};

export const createPostDto = (data) => {
  const { title, content, type, classCode, dueDate, attachments } = data;

  if (!title?.trim()) throw new Error("Title is required");
  if (!content?.trim()) throw new Error("Content is required");
  // Assuming VALID_TYPES is handled elsewhere or globally
  if (!classCode) throw new Error("ClassCode is required");

  return {
    title: title.trim(),
    content: content.trim(),
    type,
    classCode: String(classCode),
    dueDate: dueDate ? new Date(dueDate) : null,
    attachments: Array.isArray(attachments) ? attachments : [],
  };
};

