export const registerDto = (data) => {
  const { name, email, password, role, studentCode } = data;

  const normalizedName = String(name || "").trim();
  const normalizedEmail = String(email || "").trim().toLowerCase();
  if (!normalizedName || !normalizedEmail || !password || !role) {
    throw new Error("Missing required fields");
  }

  if (!["ADMIN", "TEACHER", "STUDENT"].includes(role)) {
    throw new Error("Invalid role");
  }

  const normalizedStudentCode = typeof studentCode === "string" ? studentCode.trim() : null;
  if (role === "STUDENT" && !normalizedStudentCode) {
    throw new Error("Student code is required for students");
  }

  return {
    name: normalizedName,
    email: normalizedEmail,
    password,
    role,
    studentCode: role === "STUDENT" ? normalizedStudentCode : null,
  };
};
