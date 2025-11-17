import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import db from "./db.js"; // 載入我們的資料庫連線
import { comparePassword, generateToken, hashPassword } from "./auth.js"; // 載入認證工具 (已加入 hashPassword)
import { authenticateToken, isAdmin, isOperator } from "./middleware.js"; // 載入 API 守衛
import Joi from "joi"; // <--- 這是正確的導入方式

// 讀取 .env
dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

// --- 中間件 (Middleware) ---
app.use(cors());
app.use(express.json()); // 解析傳入的 JSON

// --- 靜態資料 (不變) ---
const warehouses = [
  {
    id: "xz",
    name: "厦门漳州仓",
    receiver: `跑跑虎轉(會員編號)`,
    phone: "13682536948",
    address:
      "中国福建省漳州市龙海区東園鎮倉里路普洛斯物流園A02庫1楼一分區1號門跑跑虎(會員編號)",
  },
  {
    id: "dg",
    name: "东莞仓",
    receiver: `跑跑虎轉(會員編號)`,
    phone: "13682536948",
    address: "中国广东省东莞市洪梅镇振華路688號2號樓跑跑虎(會員編號)",
  },
  {
    id: "yw",
    name: "义乌仓",
    receiver: `跑跑虎轉(會員編號)`,
    phone: "13682536948",
    address: "中国浙江省金华市义乌市江东街道东新路19号1号楼跑跑虎(會員編號)",
  },
];

// --- 幫助函數 (SendGrid) (不變) ---
async function sendOrderEmail(order) {
  console.log(`(模擬) 正在為訂單 ${order.id} 發送郵件...`);
}

// ===================================================================
// API 路由 (Auth) - 全新功能
// ===================================================================

/**
 * 用戶登入 (管理員 / 操作人員)
 */
app.post("/api/auth/login", async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ message: "請輸入帳號和密碼" });
    }

    const userResult = await db.query(
      "SELECT * FROM users WHERE username = $1",
      [username]
    );

    if (userResult.rows.length === 0) {
      return res.status(404).json({ message: "帳號不存在" });
    }
    const user = userResult.rows[0];

    if (user.status !== "active") {
      return res.status(403).json({ message: "帳號已被停權" });
    }

    const isMatch = await comparePassword(password, user.password_hash);
    if (!isMatch) {
      return res.status(401).json({ message: "密碼錯誤" });
    }

    const token = generateToken(user);

    res.json({
      token,
      user: {
        id: user.id,
        username: user.username,
        role: user.role,
      },
    });
  } catch (err) {
    console.error("Login Error:", err.stack);
    res.status(500).json({ message: "伺服器錯誤" });
  }
});

/**
 * 獲取當前登入者資訊 (驗證 Token)
 */
app.get("/api/auth/me", authenticateToken, (req, res) => {
  res.json(req.user);
});

// ===================================================================
// API 路由 (Public) - 公開，任何人皆可訪問
// ===================================================================

app.get("/", (req, res) => {
  res.send("代採購平台後端 API 運行中... (已連接資料庫)");
});

app.get("/api/warehouses", (req, res) => {
  res.json(warehouses);
});

/**
 * (重構) 獲取所有「未封存」的商品
 */
app.get("/api/products", async (req, res) => {
  try {
    const result = await db.query(
      `SELECT id, name, description, image_url, price_twd 
             FROM products 
             WHERE is_archived = FALSE`
    );
    res.json(result.rows);
  } catch (err) {
    console.error("Get Products Error:", err.stack);
    res.status(500).json({ message: "伺服器錯誤" });
  }
});

/**
 * (重構) 獲取單一商品
 */
app.get("/api/products/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const result = await db.query(
      `SELECT id, name, description, image_url, price_twd 
             FROM products 
             WHERE id = $1 AND is_archived = FALSE`,
      [id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ message: "找不到商品" });
    }
    res.json(result.rows[0]);
  } catch (err) {
    console.error("Get Product Error:", err.stack);
    res.status(500).json({ message: "伺服器錯誤" });
  }
});

/**
 * (重構) 創建新訂單 (使用資料庫事務)
 */
app.post("/api/orders", async (req, res) => {
  const { paopaoId, items, customerEmail } = req.body;
  if (!paopaoId || !items || items.length === 0) {
    return res.status(400).json({ message: "缺少跑跑虎會員編號或購物車商品" });
  }

  const client = await db.connect(); // <--- 【修改】使用我們新的 connect 函數

  try {
    await client.query("BEGIN"); // <--- ✅ 請在這裡加上這一行
    let totalAmount_twd = 0;
    let totalCost_cny = 0;
    const processedItems = [];

    // --- 【優化】N+1 查詢改進 ---

    // 1. 從購物車中收集所有商品 ID
    const productIds = items.map((item) => item.id);

    // 2. 一次性從資料庫獲取所有商品資訊
    //    使用 ANY($1::int[]) 來查詢陣列中的所有 ID
    const productsResult = await client.query(
      `SELECT id, name, price_twd, cost_cny 
         FROM products 
         WHERE id = ANY($1::int[]) AND is_archived = FALSE`,
      [productIds]
    );

    // 3. 將查詢結果轉換為一個 Map (物件)，方便快速查找
    const productsMap = productsResult.rows.reduce((acc, product) => {
      acc[product.id] = product;
      return acc;
    }, {});

    // --- 優化結束 ---

    // 4. 再次迴圈，但這次是從 Map 中讀取資料，不再查詢資料庫
    for (const item of items) {
      const product = productsMap[item.id]; // 直接從 Map 獲取

      if (!product) {
        throw new Error(`找不到 ID 為 ${item.id} 的商品或商品已下架`);
      }
      const quantity = parseInt(item.quantity, 10);

      totalAmount_twd += product.price_twd * quantity;
      totalCost_cny += product.cost_cny * quantity;

      processedItems.push({
        product_id: item.id,
        quantity: quantity,
        snapshot_name: product.name,
        snapshot_price_twd: product.price_twd,
        snapshot_cost_cny: product.cost_cny,
      });
    }
    // --- 【優化】邏輯結束 ---

    const orderResult = await client.query(
      `INSERT INTO orders (paopao_id, customer_email, total_amount_twd, total_cost_cny, status)
             VALUES ($1, $2, $3, $4, 'Pending')
             RETURNING id, created_at`,
      [paopaoId, customerEmail, totalAmount_twd, totalCost_cny]
    );
    const newOrderId = orderResult.rows[0].id;
    const newOrderCreatedAt = orderResult.rows[0].created_at;

    for (const pItem of processedItems) {
      await client.query(
        `INSERT INTO order_items (order_id, product_id, quantity, snapshot_name, snapshot_price_twd, snapshot_cost_cny)
                 VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          newOrderId,
          pItem.product_id,
          pItem.quantity,
          pItem.snapshot_name,
          pItem.snapshot_price_twd,
          pItem.snapshot_cost_cny,
        ]
      );
    }

    await client.query("COMMIT");

    const newOrder = {
      id: newOrderId,
      paopaoId,
      customerEmail,
      items: processedItems,
      totalAmount_twd,
      status: "Pending",
      createdAt: newOrderCreatedAt,
    };

    sendOrderEmail(newOrder).catch(console.error);

    res.status(201).json({ message: "訂單已成功建立", order: newOrder });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("Create Order Error:", err.stack);
    res.status(500).json({ message: "建立訂單時發生錯誤", error: err.message });
  } finally {
    client.release();
  }
});

// ===================================================================
// API 路由 (Operator) - 操作人員 (或管理員)
// ===================================================================

/**
 * 獲取所有 "待處理" 或 "採購中" 的訂單
 */
app.get(
  "/api/operator/orders",
  authenticateToken,
  isOperator,
  async (req, res) => {
    try {
      // ✅ 升級：我們使用 LEFT JOIN 來抓取 "operator_id" 對應的 "username"
      const result = await db.query(
        `SELECT 
                orders.*, 
                users.username AS operator_name 
             FROM orders 
             LEFT JOIN users ON orders.operator_id = users.id
             WHERE orders.status IN ('Pending', 'Processing', 'Shipped_Internal')
             ORDER BY orders.created_at ASC`
      );
      res.json(result.rows);
    } catch (err) {
      console.error("Get Operator Orders Error:", err.stack);
      res.status(500).json({ message: "伺服器錯誤" });
    }
  }
);

/**
 * 操作人員更新訂單狀態或備註
 */
app.put(
  "/api/operator/orders/:id",
  authenticateToken,
  isOperator,
  async (req, res) => {
    try {
      const { id } = req.params;
      const { status, notes } = req.body;

      if (!status && !notes) {
        return res.status(400).json({ message: "請提供要更新的狀態或備註" });
      }

      const updates = [];
      const values = [];
      let queryIndex = 1;

      if (status) {
        updates.push(`status = $${queryIndex++}`);
        values.push(status);
      }
      if (notes) {
        updates.push(`notes = $${queryIndex++}`);
        values.push(notes);
      }
      values.push(id); // 最後一個是 $id

      const result = await db.query(
        `UPDATE orders SET ${updates.join(", ")} 
             WHERE id = $${queryIndex}
             RETURNING *`,
        values
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ message: "找不到訂單" });
      }
      res.json(result.rows[0]);
    } catch (err) {
      console.error("Update Operator Order Error:", err.stack);
      res.status(500).json({ message: "伺服器錯誤" });
    }
  }
);

// ===================================================================
// API 路由 (Admin) - 僅限管理員
// ===================================================================

/**
 * 獲取 "所有" 訂單 (包含已完成或取消的)
 */
app.get("/api/admin/orders", authenticateToken, isAdmin, async (req, res) => {
  try {
    const result = await db.query(
      "SELECT * FROM orders ORDER BY created_at DESC"
    );
    res.json(result.rows);
  } catch (err) {
    console.error("Get Admin Orders Error:", err.stack);
    res.status(500).json({ message: "伺服器錯誤" });
  }
});

/**
 * 管理員指派訂單或修改
 */
app.put(
  "/api/admin/orders/:id",
  authenticateToken,
  isAdmin,
  async (req, res) => {
    try {
      const { id } = req.params;
      const { status, notes, operator_id } = req.body;

      const result = await db.query(
        `UPDATE orders SET 
                status = COALESCE($1, status), 
                notes = COALESCE($2, notes), 
                operator_id = COALESCE($3, operator_id)
             WHERE id = $4
             RETURNING *`,
        [status, notes, operator_id, id]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ message: "找不到訂單" });
      }
      res.json(result.rows[0]);
    } catch (err) {
      console.error("Update Admin Order Error:", err.stack);
      res.status(500).json({ message: "伺服器錯誤" });
    }
  }
);

/**
 * 新增商品 (包含成本)
 */
app.post(
  "/api/admin/products",
  authenticateToken,
  isAdmin,
  async (req, res) => {
    // --- 【優化】1. 定義 Joi 驗證規則 ---
    const productSchema = Joi.object({
      name: Joi.string().min(1).max(255).required(),
      description: Joi.string().allow(null, ""), // 允許空字串或 null
      price_twd: Joi.number().integer().min(0).required(),
      cost_cny: Joi.number().min(0).required(),
      image_url: Joi.string().uri().allow(null, ""), // .uri() 驗證是否為 URL
    });

    // --- 【優化】2. 執行驗證 ---
    const { error, value } = productSchema.validate(req.body);

    if (error) {
      // 驗證失敗，回傳 400 錯誤
      return res
        .status(400)
        .json({ message: `輸入資料錯誤: ${error.details[0].message}` });
    }

    // --- 【優化】3. (原有的 try...catch) ---
    try {
      // ⚠️ 注意：我們使用 'value' (已清理和類型轉換的資料) 而非 'req.body'
      const { name, description, price_twd, cost_cny, image_rrl } = value;

      const result = await db.query(
        `INSERT INTO products (name, description, price_twd, cost_cny, image_url)
             VALUES ($1, $2, $3, $4, $5)
             RETURNING *`,
        [name, description, price_twd, cost_cny, image_url || null]
      );
      res.status(201).json(result.rows[0]);
    } catch (err) {
      console.error("Create Product Error:", err.stack);
      res.status(500).json({ message: "伺服器錯誤" });
    }
  }
);

/**
 * (全新) 獲取單一商品的 "完整" 資料 (含成本) (Admin only)
 */
app.get(
  "/api/admin/products/:id",
  authenticateToken,
  isAdmin,
  async (req, res) => {
    try {
      const { id } = req.params;
      const result = await db.query(`SELECT * FROM products WHERE id = $1`, [
        id,
      ]);
      if (result.rows.length === 0) {
        return res.status(404).json({ message: "找不到商品" });
      }
      res.json(result.rows[0]); // 回傳所有欄位，包含 cost_cny
    } catch (err) {
      console.error("Get Admin Product Error:", err.stack);
      res.status(500).json({ message: "伺服器錯誤" });
    }
  }
);

/**
 * 編輯商品
 */
app.put(
  "/api/admin/products/:id",
  authenticateToken,
  isAdmin,
  async (req, res) => {
    try {
      const { id } = req.params;
      const { name, description, price_twd, cost_cny, image_url } = req.body;

      // (TODO: 這裡也應該加入 Joi 驗證)

      const result = await db.query(
        `UPDATE products SET 
                name = $1, 
                description = $2, 
                price_twd = $3, 
                cost_cny = $4, 
                image_url = $5
             WHERE id = $6
             RETURNING *`,
        [name, description, price_twd, cost_cny, image_url, id]
      );
      if (result.rows.length === 0) {
        return res.status(404).json({ message: "找不到商品" });
      }
      res.json(result.rows[0]);
    } catch (err) {
      console.error("Update Product Error:", err.stack);
      res.status(500).json({ message: "伺服器錯誤" });
    }
  }
);

/**
 * 刪除商品 (改為軟刪除)
 */
app.delete(
  "/api/admin/products/:id",
  authenticateToken,
  isAdmin,
  async (req, res) => {
    try {
      const { id } = req.params;
      const result = await db.query(
        `UPDATE products SET is_archived = TRUE 
             WHERE id = $1 AND is_archived = FALSE
             RETURNING *`,
        [id]
      );
      if (result.rows.length === 0) {
        return res.status(404).json({ message: "找不到商品或已被封存" });
      }
      res.json({ message: "商品已封存", product: result.rows[0] });
    } catch (err) {
      console.error("Archive Product Error:", err.stack);
      res.status(500).json({ message: "伺服器錯誤" });
    }
  }
);

/**
 * (全新) 獲取所有用戶列表 (Admin only)
 */
app.get("/api/admin/users", authenticateToken, isAdmin, async (req, res) => {
  try {
    // 為了安全，我們絕不回傳 password_hash
    const result = await db.query(
      "SELECT id, username, role, status, created_at FROM users ORDER BY id ASC"
    );
    res.json(result.rows);
  } catch (err) {
    console.error("Get Users Error:", err.stack);
    res.status(500).json({ message: "伺服器錯誤" });
  }
});

/**
 * (全新) 建立新用戶 (通常是 Operator) (Admin only)
 */
app.post("/api/admin/users", authenticateToken, isAdmin, async (req, res) => {
  try {
    const { username, password, role } = req.body;
    if (!username || !password || !role) {
      return res.status(400).json({ message: "缺少帳號、密碼或角色" });
    }
    if (role !== "admin" && role !== "operator") {
      return res.status(400).json({ message: "無效的角色" });
    }

    // (TODO: 這裡也應該加入 Joi 驗證)

    // 1. 加密密碼
    const hashedPassword = await hashPassword(password);

    // 2. 存入資料庫
    const result = await db.query(
      `INSERT INTO users (username, password_hash, role, status)
             VALUES ($1, $2, $3, 'active')
             ON CONFLICT (username) DO NOTHING
             RETURNING id, username, role, status`,
      [username, hashedPassword, role]
    );

    if (result.rows.length === 0) {
      return res.status(409).json({ message: "帳號已存在" });
    }

    res.status(201).json(result.rows[0]);
  } catch (err) {
    // 捕捉 "username" 唯一的錯誤 (雖然 ON CONFLICT 已經處理了)
    if (err.code === "23505") {
      return res.status(409).json({ message: "帳號已存在" });
    }
    console.error("Create User Error:", err.stack);
    res.status(500).json({ message: "伺服器錯誤" });
  }
});

/**
 * (全新) 更新用戶狀態 (例如：停權) (Admin only)
 */
app.put(
  "/api/admin/users/:id/status",
  authenticateToken,
  isAdmin,
  async (req, res) => {
    try {
      const { id } = req.params;
      const { status } = req.body; // 'active' 或 'inactive'

      if (!status || (status !== "active" && status !== "inactive")) {
        return res.status(400).json({ message: "無效的狀態" });
      }

      const result = await db.query(
        `UPDATE users SET status = $1 
             WHERE id = $2 AND id != $3
             RETURNING id, username, role, status`,
        [status, id, req.user.id] // $3: 確保管理員不能停權自己
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ message: "找不到用戶或你試圖停權自己" });
      }
      res.json(result.rows[0]);
    } catch (err) {
      console.error("Update User Status Error:", err.stack);
      res.status(500).json({ message: "伺服器錯誤" });
    }
  }
);

/**
 * 績效一覽表
 */
app.get(
  "/api/admin/dashboard/stats",
  authenticateToken,
  isAdmin,
  async (req, res) => {
    try {
      const [statsResult, statusResult] = await Promise.all([
        db.query(
          `SELECT 
                    SUM(total_amount_twd) AS "totalRevenueTWD",
                    SUM(total_cost_cny) AS "totalCostCNY"
                 FROM orders
                 WHERE status != 'Cancelled'`
        ),
        db.query(
          `SELECT status, COUNT(*) AS count
                 FROM orders
                 GROUP BY status`
        ),
      ]);

      const stats = statsResult.rows[0];
      const statusCounts = statusResult.rows.reduce((acc, row) => {
        acc[row.status] = parseInt(row.count, 10);
        return acc;
      }, {});

      res.json({
        totalRevenueTWD: parseInt(stats.totalRevenueTWD, 10) || 0,
        totalCostCNY: parseFloat(stats.totalCostCNY) || 0.0,
        statusCounts: {
          Pending: statusCounts.Pending || 0,
          Processing: statusCounts.Processing || 0,
          Shipped_Internal: statusCounts.Shipped_Internal || 0,
          Warehouse_Received: statusCounts.Warehouse_Received || 0,
          Completed: statusCounts.Completed || 0,
          Cancelled: statusCounts.Cancelled || 0,
        },
      });
    } catch (err) {
      console.error("Get Dashboard Stats Error:", err.stack);
      res.status(500).json({ message: "伺服器錯誤" });
    }
  }
);

// ===================================================================
// 啟動伺服器
// ===================================================================
app.listen(PORT, () => {
  console.log(`伺服器正在 http://localhost:${PORT} 上運行 (已連接 DB)`);
});
