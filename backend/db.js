import pg from "pg";
import dotenv from "dotenv";

dotenv.config();

const { Pool } = pg;

// 建立一個連線池
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  // Render 上的外部連線需要 SSL
  // 如果你的 DATABASE_URL 來自 Render，它應該已包含 ?ssl=true
  // 如果本地連線有問題，才需要取消註解下一行
  ssl: {
    rejectUnauthorized: false,
  },
});

// 導出 'query' 函數，讓其他檔案可以使用
export default {
  query: (text, params) => pool.query(text, params),
  connect: () => pool.connect(), // <--- 【修改】新增這一行
};
