export const refreshDto = (data) => {
  if (!data.refreshToken) {
    throw new Error("Refresh token is required");
  }

  return data.refreshToken;
};