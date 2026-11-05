

export const createClassDto = (data) => {
  if (!String(data.name || "").trim()) throw new Error("Name is required");
  const semesterId = Number(data.semesterId);
  if (!Number.isSafeInteger(semesterId) || semesterId <= 0) throw new Error("Valid semesterId is required");
  return {
    name: String(data.name).trim(),
    description: data.description || "",
    code: data.code || undefined,
    semesterId,
  };
};

export const createPostDto = (data) => {
  const { title, content, type, classCode, dueDate, attachments } = data;

  if (!title?.trim()) throw new Error("Title is required");
  if (!content?.trim()) throw new Error("Content is required");
  // Assuming VALID_TYPES is handled elsewhere or globally
  if (!classCode) throw new Error("ClassCode is required");
  if (!["ANNOUNCEMENT", "ASSIGNMENT"].includes(type)) {
    throw new Error("Invalid post type");
  }

  const parsedDueDate = dueDate ? new Date(dueDate) : null;
  if (parsedDueDate && Number.isNaN(parsedDueDate.getTime())) {
    throw new Error("Invalid dueDate");
  }

  return {
    title: title.trim(),
    content: content.trim(),
    type,
    classCode: String(classCode),
    dueDate: parsedDueDate,
    attachments: Array.isArray(attachments) ? attachments : [],
  };
};

