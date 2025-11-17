// 載入必要的模組
import express from "express";
import cors from "cors";
import dotenv from "dotenv";
// import sgMail from '@sendgrid/mail'; // 之後用於發送 Email

// 讀取 .env 檔案中的環境變數
dotenv.config();

// 初始化 SendGrid
// sgMail.setApiKey(process.env.SENDGRID_API_KEY);

// -------------------------------------------------------------------
// 模擬資料庫 (未來我們會用 Postgres 取代)
// -------------------------------------------------------------------

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

// 模擬的商品列表 (現在改用 let 才能修改)
let mockProducts = [
  {
    id: "p1",
    name: "範例商品 A (例如：某牌上衣)",
    description: "這是一件很棒的衣服",
    price: 850,
    imageUrl: "https://placehold.co/300x300/E2E8F0/64748B?text=商品A",
  },
  {
    id: "p2",
    name: "範例商品 B (例如：某款鞋子)",
    description: "這雙鞋子很好穿",
    price: 1200,
    imageUrl: "https://placehold.co/300x300/E2E8F0/64748B?text=商品B",
  },
];

// 模擬的訂單列表
let mockOrders = [];

// -------------------------------------------------------------------
// Express 應用程式設定
// -------------------------------------------------------------------
const app = express();
const PORT = process.env.PORT || 5000;
app.use(cors());
app.use(express.json());

// -------------------------------------------------------------------
// 幫助函數 (Helpers) - SendGrid (與之前相同，保持不變)
// -------------------------------------------------------------------
async function sendOrderEmail(order) {
  console.log("正在準備發送郵件...");
  const customerEmail = order.customerEmail;
  const adminEmail = process.env.SENDGRID_ADMIN_EMAIL;

  if (
    !adminEmail ||
    !process.env.SENDGRID_API_KEY ||
    !process.env.SENDGRID_SENDER_EMAIL
  ) {
    console.warn("SendGrid 變數未設定，跳過郵件發送。");
    console.warn("訂單詳情 (模擬):", JSON.stringify(order, null, 2));
    return;
  }

  const orderDetailsHtml = order.items
    .map(
      (item) =>
        `<li>${item.name} (ID: ${item.id}) - 數量: ${item.quantity} - 價格: TWD ${item.price}</li>`
    )
    .join("");

  // 給管理員的通知
  const adminMsg = {
    to: adminEmail,
    from: process.env.SENDGRID_SENDER_EMAIL,
    subject: `[新訂單通知] 來自 ${order.paopaoId} 的代購訂單`,
    html: `<h2>您有一筆新的代購訂單！</h2><p><strong>跑跑虎會員編號:</strong> ${
      order.paopaoId
    }</p><p><strong>訂單總額:</strong> TWD ${
      order.totalAmount
    }</p><p><strong>訂單 (客戶 Email):</strong> ${
      order.customerEmail || "未提供"
    }</p><h3>訂單商品:</h3><ul>${orderDetailsHtml}</ul><p>請盡快處理此訂單。</p>`,
  };

  // 給客戶的確認信
  const customerMsg = {
    to: customerEmail,
    from: process.env.SENDGRID_SENDER_EMAIL,
    subject: `[${process.env.SITE_NAME || "代購平台"}] 您的訂單已收到`,
    html: `<h2>感謝您的訂單！</h2><p>我們已經收到了您的代購請求，將會盡快為您處理。</p><p><strong>您的跑跑虎會員編號:</strong> ${order.paopaoId}</p><p><strong>訂單總額:</strong> TWD ${order.totalAmount}</p><h3>您的訂單商品:</h3><ul>${orderDetailsHtml}</ul><p><strong>重要提醒：</strong></p><p>1. 關於價格： 您支付的【台幣價格】即為全部費用，已含代購服務費。</p><p>2. 關於運費： 本站不經手任何運費。貨物送達後，您需自行登入「跑跑虎集運APP」支付國際運費。</p><p>3. 關於出貨： 我們將使用您提供的「跑跑虎會員編號」（${order.paopaoId}）進行發貨。</p>`,
  };

  try {
    // *** 暫時使用 console.log 模擬 ***
    console.log("--- 模擬郵件發送 (管理員) ---");
    console.log(adminMsg.html);
    console.log("------------------------------");
    if (customerEmail) {
      console.log("--- 模擬郵件發送 (客戶) ---");
      console.log(customerMsg.html);
      console.log("------------------------------");
    }
  } catch (error) {
    console.error("SendGrid 郵件發送失敗:", error);
  }
}

// -------------------------------------------------------------------
// 簡易管理員驗證 (Admin Auth) 中間件
// -------------------------------------------------------------------
const adminAuth = (req, res, next) => {
  const adminKey = req.headers["x-admin-key"];
  if (!adminKey || adminKey !== process.env.ADMIN_SECRET_KEY) {
    return res.status(403).json({ message: "未授權：無效的管理員密鑰" });
  }
  next(); // 驗證通過，繼續執行
};

// -------------------------------------------------------------------
// API 路由 (公開) - 任何人都可以訪問
// -------------------------------------------------------------------

app.get("/", (req, res) => {
  res.send("代採購平台後端 API 運行中...");
});

// [GET] 獲取所有集運倉資訊
app.get("/api/warehouses", (req, res) => {
  res.json(warehouses);
});

// [GET] 獲取所有商品列表
app.get("/api/products", (req, res) => {
  res.json(mockProducts);
});

// [GET] 獲取單一商品詳情
app.get("/api/products/:id", (req, res) => {
  const product = mockProducts.find((p) => p.id === req.params.id);
  if (!product) {
    return res.status(404).json({ message: "找不到商品" });
  }
  res.json(product);
});

// [POST] 創建新訂單 (客戶提交)
app.post("/api/orders", async (req, res) => {
  const { paopaoId, items, customerEmail } = req.body;
  if (!paopaoId || !items || items.length === 0) {
    return res.status(400).json({ message: "缺少跑跑虎會員編號或購物車商品" });
  }

  let totalAmount = 0;
  const orderItems = [];

  for (const item of items) {
    const product = mockProducts.find((p) => p.id === item.id);
    if (product) {
      totalAmount += product.price * item.quantity;
      orderItems.push({
        id: product.id,
        name: product.name,
        price: product.price,
        quantity: item.quantity,
      });
    }
  }

  const newOrder = {
    id: `order_${Date.now()}`,
    paopaoId: paopaoId,
    customerEmail: customerEmail || null,
    items: orderItems,
    totalAmount: totalAmount,
    status: "pending", // 訂單狀態：pending (待處理), processed (已處理)
    createdAt: new Date().toISOString(),
  };

  mockOrders.push(newOrder);
  console.log("收到新訂單:", newOrder);
  await sendOrderEmail(newOrder);
  res.status(201).json({ message: "訂單已成功建立", order: newOrder });
});

// -------------------------------------------------------------------
// API 路由 (管理員) - 需要 'x-admin-key'
// -------------------------------------------------------------------

// [GET] 獲取所有訂單 (管理員用)
app.get("/api/admin/orders", adminAuth, (req, res) => {
  // 回傳時，讓最新的訂單在最上面
  res.json([...mockOrders].reverse());
});

// [PUT] 更新訂單狀態 (管理員用)
app.put("/api/admin/orders/:id", adminAuth, (req, res) => {
  const { status } = req.body;
  const orderId = req.params.id;
  const order = mockOrders.find((o) => o.id === orderId);

  if (!order) {
    return res.status(404).json({ message: "找不到訂單" });
  }
  if (!status) {
    return res.status(400).json({ message: "缺少 status 欄位" });
  }

  order.status = status;
  console.log(`訂單 ${orderId} 狀態已更新為 ${status}`);
  res.json({ message: "訂單狀態已更新", order: order });
});

// [POST] 新增商品 (管理員用)
app.post("/api/admin/products", adminAuth, (req, res) => {
  const { name, description, price, imageUrl } = req.body;
  if (!name || !price) {
    return res.status(400).json({ message: "缺少 name 或 price 欄位" });
  }

  const newProduct = {
    id: `p_${Date.now()}`,
    name,
    description: description || "",
    price: parseFloat(price),
    imageUrl:
      imageUrl || "https://placehold.co/300x300/E2E8F0/64748B?text=新商品",
  };

  mockProducts.push(newProduct);
  console.log("新增商品:", newProduct);
  res.status(201).json({ message: "商品已新增", product: newProduct });
});

// [PUT] 編輯商品 (管理員用)
app.put("/api/admin/products/:id", adminAuth, (req, res) => {
  const productId = req.params.id;
  const { name, description, price, imageUrl } = req.body;

  const productIndex = mockProducts.findIndex((p) => p.id === productId);
  if (productIndex === -1) {
    return res.status(404).json({ message: "找不到商品" });
  }

  // 更新資料
  const updatedProduct = {
    ...mockProducts[productIndex],
    name: name || mockProducts[productIndex].name,
    description: description || mockProducts[productIndex].description,
    price: parseFloat(price) || mockProducts[productIndex].price,
    imageUrl: imageUrl || mockProducts[productIndex].imageUrl,
  };

  mockProducts[productIndex] = updatedProduct;
  console.log("編輯商品:", updatedProduct);
  res.json({ message: "商品已更新", product: updatedProduct });
});

// [DELETE] 刪除商品 (管理員用)
app.delete("/api/admin/products/:id", adminAuth, (req, res) => {
  const productId = req.params.id;
  const productIndex = mockProducts.findIndex((p) => p.id === productId);

  if (productIndex === -1) {
    return res.status(404).json({ message: "找不到商品" });
  }

  // 執行刪除
  const deletedProduct = mockProducts.splice(productIndex, 1);
  console.log("刪除商品:", deletedProduct[0]);
  res.json({ message: "商品已刪除", product: deletedProduct[0] });
});

// -------------------------------------------------------------------
// 啟動伺服器
// -------------------------------------------------------------------
app.listen(PORT, () => {
  console.log(`伺服器正在 http://localhost:${PORT} 上運行`);
});
