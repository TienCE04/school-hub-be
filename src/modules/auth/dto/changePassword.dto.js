export const changePasswordDto = (data) => {
  const { oldPassword, newPassword } = data;

  if (!oldPassword || !newPassword) {
    throw new Error("Missing password");
  }

  if (newPassword.length < 6) {
    throw new Error("Password must be at least 6 characters");
  }

  return { oldPassword, newPassword };
};
