/*
 * 這是一個一次性腳本，用來建立第一個管理員帳號
 * 用法: npm run db:create-admin [username] [password]
 */

import db from "./db.js";
import { hashPassword } from "./auth.js";

async function createAdmin() {
  // 從終端機讀取帳號和密碼
  const args = process.argv.slice(2);
  const username = args[0];
  const password = args[1];

  if (!username || !password) {
    console.error("❌ 錯誤: 請提供帳號和密碼。");
    console.log("用法: npm run db:create-admin <username> <password>");
    process.exit(1);
  }

  try {
    console.log(`正在建立管理員: ${username}...`);

    // 1. 加密密碼
    const hashedPassword = await hashPassword(password);

    // 2. 存入資料庫
    const result = await db.query(
      `INSERT INTO users (username, password_hash, role, status)
             VALUES ($1, $2, 'admin', 'active')
             ON CONFLICT (username) DO NOTHING
             RETURNING id, username, role`,
      [username, hashedPassword]
    );

    if (result.rows.length === 0) {
      console.warn(`⚠️ 警告: 用戶 ${username} 已經存在，未做任何更動。`);
    } else {
      console.log("✅ 管理員帳號建立成功！");
      console.log(result.rows[0]);
    }
  } catch (err) {
    console.error("❌ 建立管理員時發生錯誤:", err.stack);
  } finally {
    process.exit();
  }
}

createAdmin();
