/*
 * 這是我們的資料庫初始化腳本
 * 它只會執行一次，用來建立所有的表格 (Tables)
 */

import db from "./db.js";

async function setupDatabase() {
  console.log("正在連接到資料庫...");

  // 我們使用 try...catch 來捕捉錯誤
  try {
    // -- 1. 建立角色 ENUM (Admin / Operator) --
    await db.query(`
            DO $$
            BEGIN
                IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'user_role') THEN
                    CREATE TYPE user_role AS ENUM ('admin', 'operator');
                END IF;
            END$$;
        `);
    console.log("User Role ENUM 已確認。");

    // -- 2. 建立 Users 表格 (管理員/操作員) --
    await db.query(`
            CREATE TABLE IF NOT EXISTS users (
                id SERIAL PRIMARY KEY,
                username VARCHAR(50) UNIQUE NOT NULL,
                password_hash TEXT NOT NULL,
                role user_role NOT NULL DEFAULT 'operator',
                status VARCHAR(20) NOT NULL DEFAULT 'active',
                created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            );
        `);
    console.log('Tables "users" 已建立。');

    // -- 3. 建立 Products 表格 (商品) --
    await db.query(`
            CREATE TABLE IF NOT EXISTS products (
                id SERIAL PRIMARY KEY,
                name VARCHAR(255) NOT NULL,
                description TEXT,
                image_url TEXT,
                cost_cny DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
                price_twd INT NOT NULL DEFAULT 0,
                is_archived BOOLEAN NOT NULL DEFAULT FALSE,
                created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            );
        `);
    console.log('Tables "products" 已建立。');

    // -- 4. 建立訂單狀態 ENUM --
    await db.query(`
            DO $$
            BEGIN
                IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'order_status') THEN
                    CREATE TYPE order_status AS ENUM (
                        'Pending', 
                        'Processing', 
                        'Shipped_Internal', 
                        'Warehouse_Received', 
                        'Completed', 
                        'Cancelled'
                    );
                END IF;
            END$$;
        `);
    console.log("Order Status ENUM 已確認。");

    // -- 5. 建立 Orders 表格 (訂單) --
    await db.query(`
            CREATE TABLE IF NOT EXISTS orders (
                id SERIAL PRIMARY KEY,
                paopao_id VARCHAR(100) NOT NULL,
                customer_email VARCHAR(255),
                total_amount_twd INT NOT NULL,
                total_cost_cny DECIMAL(10, 2) NOT NULL,
                status order_status NOT NULL DEFAULT 'Pending',
                operator_id INT REFERENCES users(id),
                notes TEXT,
                created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            );
        `);
    console.log('Tables "orders" 已建立。');

    // -- 6. 建立 OrderItems 表格 (訂單內的商品) --
    await db.query(`
            CREATE TABLE IF NOT EXISTS order_items (
                id SERIAL PRIMARY KEY,
                order_id INT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
                product_id INT NOT NULL REFERENCES products(id),
                quantity INT NOT NULL,
                snapshot_name VARCHAR(255),
                snapshot_price_twd INT NOT NULL,
                snapshot_cost_cny DECIMAL(10, 2) NOT NULL
            );
        `);
    console.log('Tables "order_items" 已建立。');

    console.log("✅ 資料庫初始化成功！");
  } catch (err) {
    console.error("❌ 初始化資料庫時發生錯誤:", err.stack);
  } finally {
    // 結束腳本
    // 雖然 pool 會自動管理，但在腳本結束時我們最好明確退出
    process.exit();
  }
}

// 執行
setupDatabase();
