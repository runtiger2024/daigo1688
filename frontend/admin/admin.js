const API_URL = "http://localhost:5000/api";
let availableOperators = []; // (--- ←←← 新增這一行)

// -------------------------------------------------
// 1. 核心：認證與守衛
// -------------------------------------------------

/**
 * 獲取儲存的 Token
 */
function getToken() {
  return localStorage.getItem("adminToken");
}

/**
 * 獲取儲存的用戶資訊
 */
function getUser() {
  try {
    return JSON.parse(localStorage.getItem("adminUser"));
  } catch (e) {
    return null;
  }
}

/**
 * 頁面載入時的第一道防線
 * 檢查 Token，若無則踢回登入頁
 */
function checkAuth() {
  if (!getToken()) {
    alert("請先登入");
    window.location.href = "login.html";
    return false;
  }
  return true;
}

/**
 * (重構) 獲取 API 請求的標頭
 * 現在改用 Bearer Token
 */
function getAuthHeaders() {
  const token = getToken();
  if (!token) {
    console.error("Token not found");
    return null;
  }
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`,
  };
}

/**
 * 登出功能
 */
function logout() {
  localStorage.removeItem("adminToken");
  localStorage.removeItem("adminUser");
  window.location.href = "login.html";
}

// -------------------------------------------------
// 2. DOM 元素
// -------------------------------------------------
const refreshButton = document.getElementById("refresh-data");
const logoutButton = document.getElementById("logout-button");
const userInfoSpan = document.getElementById("user-info");
// 訂單
const ordersTbody = document.getElementById("orders-tbody");
// 商品
const productsTbody = document.getElementById("products-tbody");
const productForm = document.getElementById("product-form");
const formTitle = document.getElementById("form-title");
const productIdInput = document.getElementById("product-id");
const productNameInput = document.getElementById("product-name");
const productPriceInput = document.getElementById("product-price");
const productCostInput = document.getElementById("product-cost"); // 新增
const productDescInput = document.getElementById("product-description");
const productImgUrlInput = document.getElementById("product-image-url");
const cancelEditBtn = document.getElementById("cancel-edit-btn");
// 績效
const statsContent = document.getElementById("stats-content");
// 人員管理
const userSection = document.getElementById("users-section");
const createUserForm = document.getElementById("create-user-form");
const usersTbody = document.getElementById("users-tbody");

// -------------------------------------------------
// 3. 載入資料 (API 呼叫)
// -------------------------------------------------

async function loadAllData() {
  // 檢查權限
  const headers = getAuthHeaders();
  if (!headers) {
    checkAuth(); // 觸發登入檢查
    return;
  }

  // 顯示用戶資訊
  const user = getUser();
  if (user) {
    userInfoSpan.textContent = `歡迎, ${user.username} (${user.role})`;
  }

  // 同時載入所有資料
  await Promise.all([
    loadStats(headers),
    loadOrders(headers),
    loadProducts(), // 載入商品不需要 Token (公開 API)
    loadUsers(headers), // 載入用戶列表
  ]);
}

// 載入績效
async function loadStats(headers) {
  try {
    const response = await fetch(`${API_URL}/admin/dashboard/stats`, {
      headers,
    });
    if (!response.ok) throw new Error(await response.json().message);

    const stats = await response.json();

    // 假設匯率 4.5
    const exchangeRate = 4.5;
    const totalCostTWD = stats.totalCostCNY * exchangeRate;
    const totalProfitTWD = stats.totalRevenueTWD - totalCostTWD;

    statsContent.innerHTML = `
            <ul>
                <li><strong>總營收 (TWD):</strong> ${stats.totalRevenueTWD}</li>
                <li><strong>總成本 (CNY):</strong> ${stats.totalCostCNY.toFixed(
                  2
                )}</li>
                <li><strong>預估利潤 (TWD):</strong> ${totalProfitTWD.toFixed(
                  0
                )}</li>
                <li><strong>待處理訂單:</strong> ${
                  stats.statusCounts.Pending
                }</li>
                <li><strong>採購中訂單:</strong> ${
                  stats.statusCounts.Processing
                }</li>
                <li><strong>已入倉訂單:</strong> ${
                  stats.statusCounts.Warehouse_Received
                }</li>
            </ul>
        `;
  } catch (error) {
    console.error("載入績效失敗:", error);
    statsContent.innerHTML = `<p style="color:red;">${error.message}</p>`;
  }
}

// 載入訂單 (改用 Operator API)
async function loadOrders(headers) {
  try {
    // 我們預設只載入 "操作人員" 需要的訂單 (待處理/採購中)
    const response = await fetch(`${API_URL}/operator/orders`, { headers });
    if (response.status === 403) throw new Error("權限不足");
    if (!response.ok) throw new Error(`HTTP 錯誤: ${response.status}`);

    const orders = await response.json();
    renderOrders(orders);
  } catch (error) {
    alert(`載入訂單失敗: ${error.message}`);
    ordersTbody.innerHTML =
      '<tr><td colspan="6" style="color: red;">載入訂單失敗。</td></tr>';
  }
}

// 載入商品 (公開 API)
async function loadProducts() {
  try {
    const response = await fetch(`${API_URL}/products`);
    if (!response.ok) throw new Error(`HTTP 錯誤: ${response.status}`);
    const products = await response.json();
    renderProducts(products); // 渲染商品
  } catch (error) {
    console.error("載入商品失敗:", error);
    productsTbody.innerHTML =
      '<tr><td colspan="6" style="color: red;">載入商品失敗。</td></tr>';
  }
}

// (全新) 載入用戶
async function loadUsers(headers) {
  // 只有 Admin 能看到用戶區塊
  const user = getUser();
  if (user.role !== "admin") {
    userSection.style.display = "none"; // 隱藏整個區塊
    return;
  }

  try {
    const response = await fetch(`${API_URL}/admin/users`, { headers });
    if (!response.ok) throw new Error("無法載入用戶");
    const users = await response.json();
    // (--- ↓↓↓ 新增 ↓↓↓ ---)
    // 儲存可用的操作人員列表，供「指派訂單」使用
    availableOperators = users.filter(
      (user) => user.role === "operator" && user.status === "active"
    );
    // (--- ↑↑↑ 新增 ↑↑↑ ---)
    renderUsers(users);
  } catch (error) {
    console.error("載入用戶失敗:", error);
    usersTbody.innerHTML =
      '<tr><td colspan="5" style="color:red;">載入用戶失敗</td></tr>';
  }
}

// -------------------------------------------------
// 4. 渲染 (Render) 函式
// -------------------------------------------------

// (重構) 渲染訂單表格
function renderOrders(orders) {
  ordersTbody.innerHTML = "";
  if (orders.length === 0) {
    ordersTbody.innerHTML = '<tr><td colspan="6">沒有待處理的訂單。</td></tr>';
    return;
  }

  // 1. 產生 "操作人員" 的 HTML 選項
  const operatorOptions = availableOperators
    .map((op) => `<option value="${op.id}">${op.username}</option>`)
    .join("");

  orders.forEach((order) => {
    const tr = document.createElement("tr");

    // 2. 顯示當前指派的人 (如果有的話)
    const assignedTo = order.operator_name
      ? ` (指派給: ${order.operator_name})`
      : " (未指派)";

    tr.innerHTML = `
            <td>${order.id}</td>
            <td>${new Date(order.created_at).toLocaleString()}</td>
            <td>${order.paopao_id}</td>
            <td>${order.total_amount_twd}</td>
            <td>
                <span class="status-${order.status}">${order.status}</span>
                <br>
                <small>${assignedTo}</small>
            </td>
            <td>
                <select class="order-status-select" data-id="${order.id}">
                    <option value="Pending" ${
                      order.status === "Pending" ? "selected" : ""
                    }>待處理</option>
                    <option value="Processing" ${
                      order.status === "Processing" ? "selected" : ""
                    }>採購中</option>
                    <option value="Shipped_Internal" ${
                      order.status === "Shipped_Internal" ? "selected" : ""
                    }>已發貨 (往集運倉)</option>
                    <option value="Warehouse_Received" ${
                      order.status === "Warehouse_Received" ? "selected" : ""
                    }>已入倉</option>
                    <option value="Cancelled" ${
                      order.status === "Cancelled" ? "selected" : ""
                    }>取消訂單</option>
                </select>

                <select class="order-operator-select" data-id="${order.id}">
                    <option value="">-- 指派給 --</option>
                    ${operatorOptions}
                </select>
            </td>
        `;

    // 3. (重要) 自動選中當前被指派的人
    if (order.operator_id) {
      const operatorSelect = tr.querySelector(".order-operator-select");
      // 我們在 <select> 標籤後設定 .value 比較安全
      operatorSelect.value = order.operator_id;
    }

    ordersTbody.appendChild(tr);
  });
}

// 渲染商品表格
function renderProducts(products) {
  productsTbody.innerHTML = "";
  if (products.length === 0) {
    productsTbody.innerHTML = '<tr><td colspan="6">目前沒有商品。</td></tr>';
    return;
  }
  products.forEach((product) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
            <td>${product.id}</td>
            <td><img src="${product.image_url}" alt="${product.name}"></td>
            <td>${product.name}</td>
            <td>${product.price_twd}</td>
            <td>N/A</td> <td>
                <button class="btn btn-edit" data-id="${product.id}">編輯</button>
                <button class="btn btn-delete" data-id="${product.id}">封存</button>
            </td>
        `;
    productsTbody.appendChild(tr);
  });
}

// (全新) 渲染用戶表格
function renderUsers(users) {
  usersTbody.innerHTML = "";
  if (users.length === 0) {
    usersTbody.innerHTML = '<tr><td colspan="5">沒有用戶。</td></tr>';
    return;
  }
  const currentUserId = getUser().id;

  users.forEach((user) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
            <td>${user.id}</td>
            <td>${user.username}</td>
            <td>${user.role}</td>
            <td>
                <span class="status-${user.status}">${user.status}</span>
            </td>
            <td>
                <button class="btn btn-delete btn-toggle-status" 
                        data-id="${user.id}" 
                        data-new-status="${
                          user.status === "active" ? "inactive" : "active"
                        }"
                        ${user.id === currentUserId ? "disabled" : ""}>
                    ${user.status === "active" ? "停權" : "啟用"}
                </button>
            </td>
        `;
    usersTbody.appendChild(tr);
  });
}

// -------------------------------------------------
// 5. 事件監聽 (Event Listeners)
// -------------------------------------------------

// 頁面載入時
document.addEventListener("DOMContentLoaded", () => {
  // 執行守衛
  if (!checkAuth()) {
    return; // 如果未登入，停止執行
  }

  // 載入所有資料
  loadAllData();

  // 綁定登出按鈕
  logoutButton.addEventListener("click", logout);

  // 綁定刷新按鈕
  refreshButton.addEventListener("click", () => {
    loadOrders(getAuthHeaders());
    loadStats(getAuthHeaders());
  });
});

// 處理商品表單提交 (新增 vs. 編輯)
productForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const headers = getAuthHeaders();
  if (!headers) return;

  const id = productIdInput.value;
  const productData = {
    name: productNameInput.value,
    price_twd: parseInt(productPriceInput.value, 10),
    cost_cny: parseFloat(productCostInput.value),
    description: productDescInput.value,
    image_url: productImgUrlInput.value,
  };

  try {
    let url = `${API_URL}/admin/products`;
    let method = "POST";
    if (id) {
      url = `${API_URL}/admin/products/${id}`;
      method = "PUT";
    }

    const response = await fetch(url, {
      method,
      headers,
      body: JSON.stringify(productData),
    });
    if (!response.ok) {
      const err = await response.json();
      throw new Error(err.message || "操作失敗");
    }

    alert(id ? "商品已更新！" : "商品已新增！");
    resetProductForm();
    await loadProducts(); // 重新載入商品列表
  } catch (error) {
    alert(`錯誤: ${error.message}`);
  }
});

// 取消編輯按鈕
cancelEditBtn.addEventListener("click", resetProductForm);

// 商品列表的按鈕事件 (編輯 / 封存)
productsTbody.addEventListener("click", async (e) => {
  const target = e.target;
  const id = target.dataset.id;
  if (!id) return;

  // 點擊 "封存" (DELETE)
  if (target.classList.contains("btn-delete")) {
    if (!confirm(`確定要 "封存" ID 為 ${id} 的商品嗎？(不會真的刪除)`)) return;

    try {
      const response = await fetch(`${API_URL}/admin/products/${id}`, {
        method: "DELETE",
        headers: getAuthHeaders(),
      });
      if (!response.ok) throw new Error("封存失敗");
      alert("商品已封存！");
      await loadProducts();
    } catch (error) {
      alert(`錯誤: ${error.message}`);
    }
  }

  // 點擊 "編輯"
  if (target.classList.contains("btn-edit")) {
    const headers = getAuthHeaders();
    if (!headers) {
      alert("Token 遺失，請重新登入");
      return;
    }

    try {
      // ✅ 修正：呼叫新的 Admin API 來獲取完整資料 (含成本)
      const response = await fetch(`${API_URL}/admin/products/${id}`, {
        headers,
      });

      if (!response.ok) {
        throw new Error("無法獲取商品資料");
      }

      const product = await response.json();

      // 將完整資料填入表單
      formTitle.textContent = `編輯商品 (ID: ${id})`;
      productIdInput.value = product.id;
      productNameInput.value = product.name;
      productPriceInput.value = product.price_twd;
      productCostInput.value = product.cost_cny; // ✅ 成功填充成本
      productDescInput.value = product.description;
      productImgUrlInput.value = product.image_url;

      cancelEditBtn.style.display = "inline-block";
      window.scrollTo({ top: 0, behavior: "smooth" }); // 滾動到頂部
    } catch (error) {
      alert(`錯誤: ${error.message}`);
    }
  }
});

// (重構) 訂單表格的 "所有" 下拉選單變更
ordersTbody.addEventListener("change", async (e) => {
  const target = e.target;
  const id = target.dataset.id;
  const headers = getAuthHeaders();
  if (!id || !headers) return;

  // ------------------------------------
  // 邏輯 1：如果變更的是 "狀態"
  // ------------------------------------
  if (target.classList.contains("order-status-select")) {
    const status = target.value;

    if (!confirm(`確定要將訂單 ${id} 的狀態改為 "${status}" 嗎？`)) {
      loadOrders(headers); // 重置下拉選單
      return;
    }

    try {
      const response = await fetch(`${API_URL}/operator/orders/${id}`, {
        method: "PUT",
        headers: headers,
        body: JSON.stringify({ status: status }), // 使用 Operator API
      });

      if (!response.ok) throw new Error("更新狀態失敗");

      alert("訂單狀態已更新！");
      await loadOrders(headers); // 重新載入訂單
    } catch (error) {
      alert(`錯誤: ${error.message}`);
    }
  }

  // ------------------------------------
  // 邏輯 2：如果變更的是 "指派" (全新)
  // ------------------------------------
  if (target.classList.contains("order-operator-select")) {
    const operatorId = target.value; // 這會是 " " (空字串) 或 "2", "3"

    if (
      !confirm(`確定要將訂單 ${id} 指派給操作員 ID: ${operatorId || "無"} 嗎？`)
    ) {
      loadOrders(headers); // 重置下拉選單
      return;
    }

    try {
      // **注意：** 這裡呼叫的是 "Admin" API
      const response = await fetch(`${API_URL}/admin/orders/${id}`, {
        method: "PUT",
        headers: headers,
        body: JSON.stringify({ operator_id: operatorId || null }), // 傳送 ID 或 null (取消指派)
      });

      if (!response.ok) throw new Error("指派失敗");

      alert("訂單指派已更新！");
      await loadOrders(headers); // 重新載入訂單 (為了更新 "指派給: xxx")
    } catch (error) {
      alert(`錯誤: ${error.message}`);
    }
  }
});

// (全新) 監聽建立用戶表單
createUserForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const headers = getAuthHeaders();
  if (!headers) return;

  const username = document.getElementById("user-username").value;
  const password = document.getElementById("user-password").value;
  const role = document.getElementById("user-role").value;

  try {
    const response = await fetch(`${API_URL}/admin/users`, {
      method: "POST",
      headers: headers,
      body: JSON.stringify({ username, password, role }),
    });

    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.message || "建立失敗");
    }

    alert("用戶建立成功！");
    createUserForm.reset();
    await loadUsers(headers); // 重新載入列表
  } catch (error) {
    alert(`錯誤: ${error.message}`);
  }
});

// (全新) 監聽用戶列表的按鈕事件 (停權/啟用)
usersTbody.addEventListener("click", async (e) => {
  if (e.target.classList.contains("btn-toggle-status")) {
    const id = e.target.dataset.id;
    const newStatus = e.target.dataset.newStatus;

    if (!confirm(`確定要將用戶 ${id} 的狀態改為 "${newStatus}" 嗎？`)) return;

    const headers = getAuthHeaders();
    if (!headers) return;

    try {
      const response = await fetch(`${API_URL}/admin/users/${id}/status`, {
        method: "PUT",
        headers: headers,
        body: JSON.stringify({ status: newStatus }),
      });

      if (!response.ok) throw new Error("更新失敗");

      alert("用戶狀態已更新！");
      await loadUsers(headers); // 重新載入
    } catch (error) {
      alert(`錯誤: ${error.message}`);
    }
  }
});

// -------------------------------------------------
// 6. 幫助 (Helper) 函式
// -------------------------------------------------

// 重設商品表單
function resetProductForm() {
  formTitle.textContent = "新增商品";
  productForm.reset();
  productIdInput.value = "";
  cancelEditBtn.style.display = "none";
}
