import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import dotenv from "dotenv";

dotenv.config();

const JWT_SECRET = process.env.JWT_SECRET;
const SALT_ROUNDS = 10;

if (!JWT_SECRET) {
  console.error("錯誤: 缺少 JWT_SECRET 環境變數。");
  console.log(
    "請在 .env 檔案中加入一行 JWT_SECRET=your_super_strong_secret_key"
  );
  process.exit(1);
}

/**
 * 將明文密碼雜湊 (Hash)
 * @param {string} password - 明文密碼
 * @returns {Promise<string>} - 雜湊後的密碼
 */
export async function hashPassword(password) {
  return bcrypt.hash(password, SALT_ROUNDS);
}

/**
 * 比較明文密碼與雜湊值
 * @param {string} password - 用戶輸入的明文密碼
 * @param {string} hash - 儲存在資料庫的雜湊密碼
 * @returns {Promise<boolean>} - 是否相符
 */
export async function comparePassword(password, hash) {
  return bcrypt.compare(password, hash);
}

/**
 * 產生一個 JWT Token
 * @param {object} user - 用戶資料 (例如 { id, username, role })
 * @returns {string} - JWT Token
 */
export function generateToken(user) {
  // 我們只將安全的、非敏感的資訊存入 Token
  const payload = {
    id: user.id,
    username: user.username,
    role: user.role,
  };

  // Token 效期設為 8 小時
  return jwt.sign(payload, JWT_SECRET, { expiresIn: "8h" });
}

/**
 * 驗證 JWT Token
 * @param {string} token - 來自 Request Header 的 Token
 * @returns {object | null} - 解碼後的用戶資料 (payload)，或 null (驗證失敗)
 */
export function verifyToken(token) {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch (err) {
    // Token 過期或無效
    return null;
  }
}
