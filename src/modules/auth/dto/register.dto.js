export const registerDto = (data) => {
  const { name, email, password, role } = data;

  if (!name || !email || !password || !role) {
    throw new Error("Missing required fields");
  }

  if (!["ADMIN", "TEACHER", "STUDENT"].includes(role)) {
    throw new Error("Invalid role");
  }

  return { name, email, password, role };
};
