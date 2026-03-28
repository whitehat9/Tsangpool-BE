import crypto from "crypto";

/**
 * Generates a random application ID for branch managers
 * Format: BM-XXXX-XXXX (where X is alphanumeric)
 */
export const generateApplicationId = (): string => {
  const firstPart = crypto.randomBytes(2).toString("hex").toUpperCase();
  const secondPart = crypto.randomBytes(2).toString("hex").toUpperCase();

  return `BM-${firstPart}-${secondPart}`;
};

/**
 * Generates a random secure password
 * Password contains uppercase, lowercase, numbers and special characters
 * Length: 10 characters
 */
export const generateRandomPassword = (): string => {
  const uppercaseChars = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  const lowercaseChars = "abcdefghijkmnopqrstuvwxyz";
  const numberChars = "23456789";
  const specialChars = "!@#$%^&*()_+";

  const allChars = uppercaseChars + lowercaseChars + numberChars + specialChars;

  let password = "";

  // Ensure at least one character from each group
  password += uppercaseChars.charAt(
    Math.floor(Math.random() * uppercaseChars.length)
  );
  password += lowercaseChars.charAt(
    Math.floor(Math.random() * lowercaseChars.length)
  );
  password += numberChars.charAt(
    Math.floor(Math.random() * numberChars.length)
  );
  password += specialChars.charAt(
    Math.floor(Math.random() * specialChars.length)
  );

  // Fill the rest with random characters
  for (let i = 0; i < 6; i++) {
    password += allChars.charAt(Math.floor(Math.random() * allChars.length));
  }

  // Shuffle the password
  return password
    .split("")
    .sort(() => 0.5 - Math.random())
    .join("");
};
