import axios from "axios";
import config from "../config/config.js";
import jwt from "jsonwebtoken";

async function refreshToken(authHeader) {
  // Call the refresh token API
  try {
    // Extract the JWT token (assuming it is of the form "Bearer <token>")
    const token = authHeader.split(" ")[1];
    // Decode the JWT token to extract the payload
    const decodedToken = jwt.decode(token);
    if (!decodedToken) {
      return { status: false, message: "Invalid token" };
    }

    const { exp } = decodedToken; // Get the expiration time from the payload
    // Check if the token is going to expire in the next 15 minutes
    const currentTime = Math.floor(Date.now() / 1000); // Current time in seconds
    const timeLeft = exp - currentTime;

    if (timeLeft < 15 * 60) {
      const refreshTokenResponse = await axios.post(
        `${config.policyServiceUrl}/v1/auth/refresh-token`,
        { token: authHeader.split(" ")[1] }
      );

      const newToken = refreshTokenResponse.data.token;

      console.log("newToken", newToken);

      // Update the authHeader with the new token
      return `Bearer ${newToken}`;
    }

    return authHeader;
  } catch (refreshError) {
    console.log("Failed to refresh the token", refreshError);
  }
}

export default refreshToken;
