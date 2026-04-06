

export const createClassDto = (data) => {
  if (!data.name) throw new Error("Name is required");
  return {
    name: data.name,
    description: data.description || "",
  };
};

export const createPostDto = (data) => {
  const { title, content, type, classId, dueDate } = data;

  if (!title?.trim()) throw new Error("Title is required");
  if (!content?.trim()) throw new Error("Content is required");
  if (!VALID_TYPES.includes(type)) throw new Error("Invalid post type");
  if (!classId) throw new Error("ClassId is required");

  return {
    title: title.trim(),
    content: content.trim(),
    type,
    classId: Number(classId),
    dueDate: dueDate ? new Date(dueDate) : null,
  };
};

