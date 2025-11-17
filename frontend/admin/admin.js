const API_URL = "http://localhost:5000/api";

// DOM 元素
const adminKeyInput = document.getElementById("admin-key");
const refreshButton = document.getElementById("refresh-data");
const ordersTbody = document.getElementById("orders-tbody");
const productsTbody = document.getElementById("products-tbody");
const productForm = document.getElementById("product-form");
const formTitle = document.getElementById("form-title");
const productIdInput = document.getElementById("product-id");
const productNameInput = document.getElementById("product-name");
const productPriceInput = document.getElementById("product-price");
const productDescInput = document.getElementById("product-description");
const productImgUrlInput = document.getElementById("product-image-url");
const cancelEditBtn = document.getElementById("cancel-edit-btn");

// 獲取管理員密鑰
function getAdminKey() {
  const key = adminKeyInput.value;
  if (!key) {
    alert("請輸入管理員密鑰！");
    return null;
  }
  return key;
}

// 獲取 API 請求的標頭
function getAuthHeaders() {
  const key = getAdminKey();
  if (!key) return null;
  return {
    "Content-Type": "application/json",
    "x-admin-key": key,
  };
}

// -------------------------------------------------
// 載入資料 (訂單 & 商品)
// -------------------------------------------------

async function loadAllData() {
  await loadOrders();
  await loadProducts();
}

// 載入訂單
async function loadOrders() {
  const headers = getAuthHeaders();
  if (!headers) return; // 沒有密鑰，停止執行

  try {
    const response = await fetch(`${API_URL}/admin/orders`, { headers });
    if (!response.ok) {
      if (response.status === 403) throw new Error("密鑰錯誤或未授權");
      throw new Error(`HTTP 錯誤: ${response.status}`);
    }
    const orders = await response.json();
    renderOrders(orders);
  } catch (error) {
    alert(`載入訂單失敗: ${error.message}`);
    ordersTbody.innerHTML =
      '<tr><td colspan="7" style="color: red;">載入訂單失敗。</td></tr>';
  }
}

// 載入商品
async function loadProducts() {
  try {
    // 獲取商品 *不需要* 密鑰 (公開 API)
    const response = await fetch(`${API_URL}/products`);
    if (!response.ok) throw new Error(`HTTP 錯誤: ${response.status}`);
    const products = await response.json();
    renderProducts(products);
  } catch (error) {
    alert(`載入商品失敗: ${error.message}`);
    productsTbody.innerHTML =
      '<tr><td colspan="5" style="color: red;">載入商品失敗。</td></tr>';
  }
}

// -------------------------------------------------
// 渲染 (Render) 函式
// -------------------------------------------------

// 渲染訂單表格
function renderOrders(orders) {
  ordersTbody.innerHTML = "";
  if (orders.length === 0) {
    ordersTbody.innerHTML = '<tr><td colspan="7">目前沒有訂單。</td></tr>';
    return;
  }

  orders.forEach((order) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
            <td>${order.id}</td>
            <td>${new Date(order.createdAt).toLocaleString()}</td>
            <td>${order.paopaoId}</td>
            <td>${order.customerEmail || "N/A"}</td>
            <td>${order.totalAmount}</td>
            <td>
                <span class="status-${order.status}">${order.status}</span>
            </td>
            <td>
                <button class="btn btn-update" data-id="${order.id}" 
                        ${order.status === "processed" ? "disabled" : ""}>
                    標記為已處理
                </button>
            </td>
        `;
    ordersTbody.appendChild(tr);
  });
}

// 渲染商品表格
function renderProducts(products) {
  productsTbody.innerHTML = "";
  if (products.length === 0) {
    productsTbody.innerHTML = '<tr><td colspan="5">目前沒有商品。</td></tr>';
    return;
  }

  products.forEach((product) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
            <td>${product.id}</td>
            <td><img src="${product.imageUrl}" alt="${product.name}"></td>
            <td>${product.name}</td>
            <td>${product.price}</td>
            <td>
                <button class="btn btn-edit" data-id="${product.id}">編輯</button>
                <button class="btn btn-delete" data-id="${product.id}">刪除</button>
            </td>
        `;
    productsTbody.appendChild(tr);
  });
}

// -------------------------------------------------
// 事件監聽 (Event Listeners)
// -------------------------------------------------

// 頁面載入時 & 點擊刷新按鈕
document.addEventListener("DOMContentLoaded", loadAllData);
refreshButton.addEventListener("click", loadAllData);

// 處理商品表單提交 (新增 vs. 編輯)
productForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const headers = getAuthHeaders();
  if (!headers) return;

  const id = productIdInput.value; // 取得隱藏欄位的 ID
  const productData = {
    name: productNameInput.value,
    price: parseFloat(productPriceInput.value),
    description: productDescInput.value,
    imageUrl: productImgUrlInput.value,
  };

  try {
    let response;
    let url = `${API_URL}/admin/products`;
    let method = "POST";

    if (id) {
      // 如果有 ID，代表是 "編輯"
      url = `${API_URL}/admin/products/${id}`;
      method = "PUT";
    }

    response = await fetch(url, {
      method: method,
      headers: headers,
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

// 商品列表的按鈕事件 (編輯 / 刪除) - 使用事件委派
productsTbody.addEventListener("click", async (e) => {
  const target = e.target;
  const id = target.dataset.id;
  if (!id) return;

  // 點擊 "刪除"
  if (target.classList.contains("btn-delete")) {
    if (!confirm(`確定要刪除 ID 為 ${id} 的商品嗎？`)) return;

    const headers = getAuthHeaders();
    if (!headers) return;

    try {
      const response = await fetch(`${API_URL}/admin/products/${id}`, {
        method: "DELETE",
        headers: headers,
      });
      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.message || "刪除失敗");
      }
      alert("商品已刪除！");
      await loadProducts(); // 重新載入列表
    } catch (error) {
      alert(`錯誤: ${error.message}`);
    }
  }

  // 點擊 "編輯"
  if (target.classList.contains("btn-edit")) {
    // 從 API 獲取最新的商品資料 (避免資料過時)
    const response = await fetch(`${API_URL}/products/${id}`);
    const product = await response.json();

    // 填入表單
    formTitle.textContent = `編輯商品 (ID: ${id})`;
    productIdInput.value = product.id;
    productNameInput.value = product.name;
    productPriceInput.value = product.price;
    productDescInput.value = product.description;
    productImgUrlInput.value = product.imageUrl;
    cancelEditBtn.style.display = "inline-block";
    window.scrollTo({ top: 0, behavior: "smooth" }); // 滾動到頁面頂部
  }
});

// 訂單列表的按鈕事件 (更新狀態) - 使用事件委派
ordersTbody.addEventListener("click", async (e) => {
  const target = e.target;
  const id = target.dataset.id;
  if (!id || !target.classList.contains("btn-update")) return;

  if (!confirm(`確定要將訂單 ${id} 標記為 "已處理" 嗎？`)) return;

  const headers = getAuthHeaders();
  if (!headers) return;

  try {
    const response = await fetch(`${API_URL}/admin/orders/${id}`, {
      method: "PUT",
      headers: headers,
      body: JSON.stringify({ status: "processed" }), // 更新狀態
    });
    if (!response.ok) {
      const err = await response.json();
      throw new Error(err.message || "更新失敗");
    }

    alert("訂單狀態已更新！");
    await loadOrders(); // 重新載入訂單
  } catch (error) {
    alert(`錯誤: ${error.message}`);
  }
});

// 重設商品表單
function resetProductForm() {
  formTitle.textContent = "新增商品";
  productForm.reset(); // 清空表單
  productIdInput.value = ""; // 清除隱藏的 ID
  cancelEditBtn.style.display = "none";
}
