import jwt from "jsonwebtoken";

export const createAccessToken = id =>
  jwt.sign({ id }, process.env.JWT_SECRET, {
    expiresIn: "15m",
  });

export const createRefreshToken = id =>
  jwt.sign({ id }, process.env.JWT_REFRESH_SECRET, {
    expiresIn: "7d",
  });