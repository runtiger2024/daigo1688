/**
 * 異步載入共用組件 (例如頁首、頁尾)
 * @param {string} componentPath - 組件的 HTML 檔案路徑 (例如 '_header.html')
 * @param {string} placeholderId - 要插入內容的佔位符 ID (例如 'header-placeholder')
 */
async function loadComponent(componentPath, placeholderId) {
  const placeholder = document.getElementById(placeholderId);
  if (!placeholder) {
    console.warn(`警告: 找不到 ID 為 "${placeholderId}" 的佔位符。`);
    return;
  }

  try {
    const response = await fetch(componentPath);
    if (!response.ok) {
      throw new Error(`無法載入 ${componentPath} - 狀態: ${response.status}`);
    }
    const html = await response.text();
    placeholder.innerHTML = html;
  } catch (error) {
    console.error(`載入組件失敗: ${error.message}`);
    placeholder.innerHTML = `<p style="color:red; text-align:center;">${componentPath} 載入失敗。</p>`;
  }
}

// 這是我們後端 API 的基礎 URL
// 我們從後端伺服器 (http://localhost:5000) 獲取資料
const API_URL = "http://localhost:5000/api";

// 當 DOM 內容完全載入後執行
document.addEventListener("DOMContentLoaded", () => {
  // !!
  // !! 第一步：非同步載入共用頁首
  // !!
  loadComponent("./_header.html", "header-placeholder");

  // 接著執行原本的功能
  fetchProducts();
  setupOrderButton();
});

// 1. 從後端獲取商品並顯示在頁面上
async function fetchProducts() {
  const productListDiv = document.getElementById("product-list");

  try {
    const response = await fetch(`${API_URL}/products`);
    if (!response.ok) {
      throw new Error(`HTTP 錯誤! 狀態: ${response.status}`);
    }
    const products = await response.json();

    // 清空「正在載入...」
    productListDiv.innerHTML = "";

    // 為每個商品創建一個卡片
    products.forEach((product) => {
      const card = document.createElement("div");
      card.className = "product-card"; // 套用 CSS 樣式

      card.innerHTML = `
                <img src="${product.imageUrl}" alt="${product.name}">
                <h3>${product.name}</h3>
                <p>${product.description}</p>
                <div class="price">TWD ${product.price}</div>
                <button>加入購物車</button> 
            `;
      productListDiv.appendChild(card);
    });
  } catch (error) {
    console.error("獲取商品失敗:", error);
    productListDiv.innerHTML =
      '<p style="color: red;">載入商品失敗，請稍後再試。</p>';
  }
}

// 2. 設定「測試提交訂單」按鈕的功能
function setupOrderButton() {
  const testButton = document.getElementById("test-order-button");
  if (!testButton) return;

  testButton.addEventListener("click", async () => {
    const paopaoId = document.getElementById("paopao-id").value;
    const customerEmail = document.getElementById("customer-email").value;

    if (!paopaoId) {
      alert("請輸入跑跑虎會員編號！");
      return;
    }

    // 這是我們模擬的購物車商品 (p1, 數量 2)
    const mockOrderItems = [
      { id: "p1", quantity: 2 },
      { id: "p2", quantity: 1 },
    ];

    const orderData = {
      paopaoId: paopaoId,
      customerEmail: customerEmail,
      items: mockOrderItems,
    };

    try {
      const response = await fetch(`${API_URL}/orders`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(orderData),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.message || "訂單提交失敗");
      }

      alert(
        `訂單提交成功！\n訂單 ID: ${result.order.id}\n總金額: ${result.order.totalAmount}`
      );

      // 你現在可以去檢查你的後端終端機 (第一個終단機)
      // 你會看到「收到新訂單」的日誌
      // 並且 (如果你設定了 SendGrid) 你和客戶的信箱會收到郵件
    } catch (error) {
      console.error("提交訂單時出錯:", error);
      alert(`錯誤: ${error.message}`);
    }
  });
}
