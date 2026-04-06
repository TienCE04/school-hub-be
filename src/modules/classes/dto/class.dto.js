import { parse } from "dotenv";

export const createClassDto = (data) => {
  if (!data.name) throw new Error("Name is required");
  return {
    name: data.name,
    description: data.description || "",
  };
};

export const createPostDto = (data) => {
  const { title, content, type, classId, dueDate } = data;
  if (!title || !content || !type || !classId)
    throw new Error("Title, content, type and classId are required");
  return {
    title,
    content,
    type,
    classId: parseInt(classId),
    dueDate: dueDate ? new Date(dueDate) : null,
  };
};

