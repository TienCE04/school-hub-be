export const loginDto = (data) => {
  if (!data.email || !data.password) {
    throw new Error("Email and password are required");
  }

  return {
    email: data.email,
    password: data.password
  };
};