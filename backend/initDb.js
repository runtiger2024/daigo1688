/*
 * 這是我們的資料庫初始化腳本
 * 它只會執行一次，用來建立所有的表格 (Tables)
 */

import db from "./db.js";

async function setupDatabase() {
  console.log("正在連接到資料庫...");
  const client = await db.connect(); // <--- 取得一個 client 來執行事務

  // 我們使用 try...catch 來捕捉錯誤
  try {
    await client.query("BEGIN"); // <--- 開始事務

    // -- 1. 建立角色 ENUM (Admin / Operator) --
    await client.query(`
            DO $$
            BEGIN
                IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'user_role') THEN
                    CREATE TYPE user_role AS ENUM ('admin', 'operator');
                END IF;
            END$$;
        `);
    console.log("User Role ENUM 已確認。");

    // -- 2. 建立 Users 表格 (管理員/操作員) --
    await client.query(`
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
    await client.query(`
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
    await client.query(`
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
    await client.query(`
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
    await client.query(`
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

    // -- 7. 建立 Warehouses 表格 (倉庫) --
    await client.query(`
            CREATE TABLE IF NOT EXISTS warehouses (
                id SERIAL PRIMARY KEY,
                name VARCHAR(100) NOT NULL UNIQUE, 
                receiver VARCHAR(100) NOT NULL,
                phone VARCHAR(50) NOT NULL,
                address TEXT NOT NULL,
                is_active BOOLEAN NOT NULL DEFAULT TRUE,
                created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            );
        `);
    console.log('Tables "warehouses" 已建立 (並確認 UNIQUE 約束)。');

    // -- 7.5 為已經存在的資料表補上 UNIQUE 約束 --
    await client.query(`
            DO $$
            BEGIN
                IF NOT EXISTS (
                    SELECT 1 FROM pg_constraint 
                    WHERE conrelid = 'warehouses'::regclass 
                    AND conname = 'warehouses_name_key'
                ) THEN
                    ALTER TABLE warehouses ADD CONSTRAINT warehouses_name_key UNIQUE (name);
                    RAISE NOTICE '已為 "warehouses" 表的 "name" 欄位加上 UNIQUE 約束。';
                END IF;
            END$$;
        `);
    console.log("Warehouse UNIQUE 約束已修復。");

    // -- 8. 插入預設的倉庫資料 --
    await client.query(`
            INSERT INTO warehouses (name, receiver, phone, address)
            VALUES 
            ('厦门漳州仓', '跑跑虎轉(會員編號)', '13682536948', '中国福建省漳州市龙海区東園鎮倉里路普洛斯物流園A02庫1楼一分區1號門跑跑虎(會員編號)'),
            ('东莞仓', '跑跑虎轉(會員編號)', '13682536948', '中国广东省东莞市洪梅镇振華路688號2號樓跑跑虎(會員編號)'),
            ('义乌仓', '跑跑虎轉(會員編號)', '13682536948', '中国浙江省金华市义乌市江东街道东新路19号1号楼跑跑虎(會員編號)')
            ON CONFLICT (name) DO NOTHING;
        `);
    console.log("預設倉庫資料已插入。");

    // -- 9. (【全新】) 建立 Customers 表格 (客戶會員) --
    await client.query(`
            CREATE TABLE IF NOT EXISTS customers (
                id SERIAL PRIMARY KEY,
                paopao_id VARCHAR(100) UNIQUE NOT NULL, -- 用跑跑虎 ID 當帳號
                password_hash TEXT NOT NULL, -- 儲存手機號碼的雜湊
                email VARCHAR(255) UNIQUE NOT NULL,
                created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            );
        `);
    console.log('Tables "customers" 已建立。');

    await client.query("COMMIT"); // <--- 提交事務
    console.log("✅ 資料庫初始化成功！");
  } catch (err) {
    await client.query("ROLLBACK"); // <--- 回滾事務
    console.error("❌ 初始化資料庫時發生錯誤:", err.stack);
  } finally {
    client.release(); // <--- 釋放 client
    // 結束腳本
    process.exit();
  }
}

// 執行
setupDatabase();
