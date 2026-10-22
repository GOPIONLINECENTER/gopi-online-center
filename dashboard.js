/* GOPI ONLINE SERVICE — Dashboard
   Keeps existing section IDs/navigation and connects service ordering + order history.
   Requires ./supabase.js to export `supabase`.
*/
"use strict";

import { supabase } from "./supabase.js";

const $ = (id) => document.getElementById(id);
const sidebar = $("sidebar");
const sidebarOverlay = $("sidebarOverlay");
const menuToggle = $("menuToggle");
const pageTitle = $("pageTitle");
const logoutButton = $("logoutButton");

const sections = {
  overview: $("overviewSection"),
  profile: $("profileSection"),
  notifications: $("notificationsSection"),
  services: $("servicesSection"),
  orders: $("ordersSection")
};

const pageNames = {
  overview: "Dashboard",
  profile: "My Profile",
  notifications: "Notifications",
  services: "All Services",
  orders: "My Orders"
};

let currentUser = null;
let isLoggingOut = false;
let cachedServices = [];
let cachedOrders = [];
let orderChannel = null;
let activeService = null;

const STATUS_LABELS = {
  pending: "Pending",
  paid: "Paid",
  processing: "Processing",
  completed: "Completed",
  cancelled: "Cancelled",
  rejected: "Rejected"
};

function escapeHTML(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[char]);
}

function money(value) {
  const amount = Number(value ?? 0);
  return new Intl.NumberFormat("en-IN", {
    style: "currency", currency: "INR", maximumFractionDigits: 2
  }).format(Number.isFinite(amount) ? amount : 0);
}

function formatDate(value) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit"
  }).format(date);
}

function showMessage(message, type = "info") {
  const wrapper = document.querySelector(".content-wrapper") || document.querySelector("main");
  if (!wrapper) return;
  let box = $("dashboardMessage");
  if (!box) {
    box = document.createElement("div");
    box.id = "dashboardMessage";
    box.setAttribute("role", "status");
    box.setAttribute("aria-live", "polite");
    wrapper.prepend(box);
  }
  box.className = `dashboard-message ${type}`;
  box.textContent = message;
  box.style.cssText = [
    "padding:12px 16px", "margin:0 0 16px", "border-radius:12px",
    "font-size:14px", "border:1px solid #ded8ff",
    type === "error" ? "background:#fff0f0;color:#9b1c1c;border-color:#ffd0d0" :
    type === "success" ? "background:#edfff5;color:#17633b;border-color:#bdebd0" :
    "background:#f4f1ff;color:#493b83"
  ].join(";");
  clearTimeout(showMessage.timer);
  showMessage.timer = setTimeout(() => box?.remove(), 5500);
}

function closeSidebar() {
  sidebar?.classList.remove("active", "open");
  sidebarOverlay?.classList.remove("active", "show");
  document.body.classList.remove("sidebar-open");
}

function navigate(sectionName) {
  if (!sections[sectionName]) return;
  Object.entries(sections).forEach(([key, element]) => {
    if (element) {
      element.hidden = key !== sectionName;
      element.classList.toggle("active", key === sectionName);
    }
  });
  document.querySelectorAll("[data-section]").forEach((button) => {
    const selected = button.dataset.section === sectionName;
    button.classList.toggle("active", selected);
    if (selected) button.setAttribute("aria-current", "page");
    else button.removeAttribute("aria-current");
  });
  if (pageTitle) pageTitle.textContent = pageNames[sectionName] || "Dashboard";
  closeSidebar();
  if (sectionName === "orders") loadOrders();
  if (sectionName === "overview") loadOrders();
}

document.querySelectorAll("[data-section]").forEach((button) => {
  button.addEventListener("click", () => navigate(button.dataset.section));
});
menuToggle?.addEventListener("click", () => {
  sidebar?.classList.toggle("active");
  sidebarOverlay?.classList.toggle("active");
  document.body.classList.toggle("sidebar-open");
});
sidebarOverlay?.addEventListener("click", closeSidebar);

function setText(id, value) {
  const element = $(id);
  if (element) element.textContent = value ?? "";
}

function getDisplayName(user) {
  const metadata = user?.user_metadata || {};
  return metadata.full_name || metadata.name || metadata.username ||
    user?.email?.split("@")[0] || "Customer";
}

function renderProfile(user) {
  const name = getDisplayName(user);
  const email = user?.email || "—";
  const mobile = user?.user_metadata?.phone || user?.user_metadata?.mobile || "—";
  ["topbarUserName", "welcomeUserName", "profileName", "detailName"].forEach((id) => setText(id, name));
  ["profileEmail", "detailEmail"].forEach((id) => setText(id, email));
  setText("detailMobile", mobile);
  setText("detailAccountStatus", user?.email_confirmed_at ? "Verified" : "Active");
  const initials = name.trim().split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase() || "G";
  ["topbarAvatar", "profileAvatar"].forEach((id) => {
    const element = $(id);
    if (!element) return;
    if (element.tagName === "IMG") {
      element.alt = `${name} avatar`;
      if (!element.getAttribute("src")) element.style.display = "none";
    } else {
      element.textContent = initials;
    }
  });
}

function serviceDescription(service) {
  return service.description?.trim() || `Place an order for ${service.name}. Our team will contact you if additional details are required.`;
}

function renderServiceCard(service, compact = false) {
  const name = escapeHTML(service.name);
  const description = escapeHTML(service.description || "Professional online service.");
  const price = money(service.price);
  const id = escapeHTML(service.id);
  return `<article class="service-card" data-service-id="${id}">
    <div class="service-card-icon" aria-hidden="true"><i class="fa-solid fa-file-lines"></i></div>
    <h3>${name}</h3>
    <p>${description}</p>
    <div class="service-card-footer">
      <strong class="service-price">${price}</strong>
      <button type="button" class="service-action" data-order-service="${id}" aria-label="Order ${name}">
        ${compact ? "Order Now" : "Order Service"} <i class="fa-solid fa-arrow-right" aria-hidden="true"></i>
      </button>
    </div>
  </article>`;
}

function bindOrderButtons(root = document) {
  root.querySelectorAll("[data-order-service]").forEach((button) => {
    if (button.dataset.bound === "true") return;
    button.dataset.bound = "true";
    button.addEventListener("click", () => {
      const service = cachedServices.find((item) => item.id === button.dataset.orderService);
      if (service) openOrderModal(service);
    });
  });
}

async function loadServicesFromDatabase() {
  const featured = $("featuredServices");
  const allGrid = document.querySelector(".all-services-grid");
  if (featured) featured.innerHTML = `<div class="service-loading">Loading services…</div>`;
  if (allGrid) allGrid.innerHTML = `<div class="service-loading">Loading services…</div>`;

  const { data, error } = await supabase
    .from("services")
    .select("id,name,description,price,is_active,created_at")
    .eq("is_active", true)
    .order("name", { ascending: true });

  if (error) {
    if (featured) featured.innerHTML = `<p class="empty-state">Services could not be loaded. Please refresh or contact support.</p>`;
    if (allGrid) allGrid.innerHTML = `<p class="empty-state">Services could not be loaded. Please refresh or contact support.</p>`;
    showMessage(`Could not load services: ${error.message}`, "error");
    setText("availableServicesCount", "—");
    return;
  }

  cachedServices = data || [];
  setText("availableServicesCount", cachedServices.length);
  const cards = cachedServices.map((service) => renderServiceCard(service, true)).join("");
  const empty = `<div class="empty-state"><i class="fa-regular fa-folder-open"></i><p>No services are available right now. Please check again later.</p></div>`;
  if (featured) featured.innerHTML = cards || empty;
  if (allGrid) allGrid.innerHTML = cards || empty;
  bindOrderButtons(document);
}

function ensureOrderModal() {
  let modal = $("orderCreateModal");
  if (modal) return modal;

  modal = document.createElement("div");
  modal.id = "orderCreateModal";
  modal.className = "modal-backdrop";
  modal.hidden = true;
  modal.innerHTML = `
    <section class="modal-card order-create-card" role="dialog" aria-modal="true" aria-labelledby="orderCreateTitle">
      <button type="button" class="modal-close" id="closeOrderCreateModal" aria-label="Close dialog"><i class="fa-solid fa-xmark"></i></button>
      <div class="order-modal-heading">
        <span class="order-modal-icon"><i class="fa-solid fa-file-circle-check"></i></span>
        <div><h2 id="orderCreateTitle">Place an order</h2><p>Review the service and enter your contact details.</p></div>
      </div>
      <div class="order-selected-service" id="orderSelectedService"></div>
      <form id="orderCreateForm" novalidate>
        <label for="orderCustomerName">Full name <span aria-hidden="true">*</span></label>
        <input id="orderCustomerName" name="customer_name" type="text" autocomplete="name" maxlength="120" required>
        <label for="orderCustomerMobile">Mobile number <span aria-hidden="true">*</span></label>
        <input id="orderCustomerMobile" name="customer_mobile" type="tel" inputmode="tel" autocomplete="tel" maxlength="20" placeholder="Enter your contact number" required>
        <label for="orderCustomerNotes">Additional details <small>(optional)</small></label>
        <textarea id="orderCustomerNotes" name="customer_notes" rows="3" maxlength="1500" placeholder="Tell us what you need…"></textarea>
        <div class="secure-payment-panel"><div class="secure-payment-top"><span class="secure-payment-icon"><i class="fa-solid fa-shield-halved"></i></span><div><strong>Secure online payment</strong><small>Powered by Razorpay</small></div><span class="secure-lock"><i class="fa-solid fa-lock"></i> Secure</span></div><div class="payment-method-chips"><span><i class="fa-solid fa-mobile-screen-button"></i> UPI</span><span><i class="fa-solid fa-qrcode"></i> QR / Apps</span><span><i class="fa-solid fa-credit-card"></i> Cards</span></div><p>Pay securely. Your order is marked paid only after server-side verification.</p></div>
        <div class="order-form-error" id="orderCreateError" role="alert" hidden></div>
        <div class="order-form-actions">
          <button type="button" class="order-cancel-btn" id="cancelOrderCreate">Cancel</button>
          <button type="submit" class="order-submit-btn" id="submitOrderCreate"><i class="fa-solid fa-lock"></i> Continue to Payment</button>
        </div>
      </form>
    </section>`;
  document.body.appendChild(modal);
  modal.addEventListener("click", (event) => {
    if (event.target === modal) closeOrderModal();
  });
  $("closeOrderCreateModal")?.addEventListener("click", closeOrderModal);
  $("cancelOrderCreate")?.addEventListener("click", closeOrderModal);
  $("orderCreateForm")?.addEventListener("submit", submitOrder);
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !modal.hidden) closeOrderModal();
  });
  return modal;
}

function openOrderModal(service) {
  if (!currentUser) {
    showMessage("Please sign in again before placing an order.", "error");
    return;
  }
  activeService = service;
  const modal = ensureOrderModal();
  const selected = $("orderSelectedService");
  if (selected) {
    selected.innerHTML = `<div><span>Selected service</span><strong>${escapeHTML(service.name)}</strong></div><strong>${money(service.price)}</strong>`;
  }
  const form = $("orderCreateForm");
  form?.reset();
  setText("orderCreateTitle", "Place an order");
  const nameInput = $("orderCustomerName");
  if (nameInput) nameInput.value = getDisplayName(currentUser);
  const mobileInput = $("orderCustomerMobile");
  if (mobileInput) mobileInput.value = currentUser.user_metadata?.phone || currentUser.user_metadata?.mobile || "";
  const error = $("orderCreateError");
  if (error) { error.hidden = true; error.textContent = ""; }
  modal.hidden = false;
  modal.classList.add("active");
  document.body.style.overflow = "hidden";
  setTimeout(() => nameInput?.focus(), 30);
}

function closeOrderModal() {
  const modal = $("orderCreateModal");
  if (!modal) return;
  modal.hidden = true;
  modal.classList.remove("active");
  document.body.style.overflow = "";
  activeService = null;
}

async function submitOrder(event) {
  event.preventDefault();
  if (!currentUser || !activeService) return;
  const name = $("orderCustomerName")?.value.trim() || "";
  const mobile = $("orderCustomerMobile")?.value.trim() || "";
  const notes = $("orderCustomerNotes")?.value.trim() || "";
  const errorBox = $("orderCreateError");
  const submitButton = $("submitOrderCreate");
  const fail = (message) => { if (errorBox) { errorBox.textContent = message; errorBox.hidden = false; } };
  if (name.length < 2) return fail("Please enter your full name (at least 2 characters).");
  const digits = mobile.replace(/\D/g, "");
  if (digits.length < 10 || digits.length > 15) return fail("Please enter a valid mobile number.");
  if (notes.length > 1500) return fail("Additional details must be 1,500 characters or fewer.");
  if (!window.GOPI_RAZORPAY_CONFIG || !window.GOPI_RAZORPAY_CONFIG.keyId || window.GOPI_RAZORPAY_CONFIG.keyId.includes("YOUR_")) {
    return fail("Razorpay is not configured yet. Please contact the website administrator.");
  }
  if (submitButton) { submitButton.disabled = true; submitButton.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Preparing secure payment…'; }
  if (errorBox) { errorBox.hidden = true; errorBox.textContent = ""; }
  try {
    const { data: service, error: serviceError } = await supabase.from("services").select("id,name,price,is_active").eq("id", activeService.id).eq("is_active", true).single();
    if (serviceError || !service) throw new Error("This service is no longer available. Please refresh the page.");
    const { data: authData, error: authError } = await supabase.auth.getUser();
    if (authError || !authData?.user) throw new Error("Your session has expired. Please sign in again.");
    const { data: created, error: insertError } = await supabase.from("orders").insert({
      user_id: authData.user.id, service_id: service.id, service_name: service.name,
      amount: Number(service.price), customer_name: name, customer_mobile: mobile,
      customer_notes: notes || null, order_status: "pending", payment_status: "pending"
    }).select("id,order_number,service_name,amount,order_status,created_at").single();
    if (insertError || !created) {
      if (insertError?.code === "42501" || /row-level security|permission denied/i.test(insertError?.message || "")) throw new Error("Supabase order saving is blocked by its security policy. Please configure the orders INSERT/SELECT policy.");
      if (/payment_status|column/i.test(insertError?.message || "")) throw new Error("The payment database update is needed first. Follow the RAZORPAY-SETUP.txt instructions, then retry.");
      throw insertError || new Error("Could not create the order.");
    }
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData?.session?.access_token;
    if (!token) throw new Error("Your session has expired. Please sign in again.");
    const cfg = window.GOPI_RAZORPAY_CONFIG;
    const createResponse = await fetch(cfg.createOrderUrl, { method: "POST", headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` }, body: JSON.stringify({ orderId: created.id }) });
    const orderData = await createResponse.json().catch(() => ({}));
    if (!createResponse.ok) throw new Error(orderData.error || "Could not start Razorpay checkout. Check server configuration.");
    closeOrderModal();
    const options = {
      key: cfg.keyId, amount: orderData.amount, currency: orderData.currency || "INR",
      name: "GOPI ONLINE CENTER", description: created.service_name,
      order_id: orderData.razorpayOrderId,
      prefill: { name, contact: mobile, email: authData.user.email || "" },
      notes: { order_id: String(created.id), order_number: String(created.order_number || "") },
      theme: { color: "#2563eb" },
      handler: async function (response) {
        try {
          showMessage("Payment received. Verifying securely…", "info");
          const verifyResponse = await fetch(cfg.verifyPaymentUrl, { method: "POST", headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` }, body: JSON.stringify({ orderId: created.id, razorpay_order_id: response.razorpay_order_id, razorpay_payment_id: response.razorpay_payment_id, razorpay_signature: response.razorpay_signature }) });
          const verified = await verifyResponse.json().catch(() => ({}));
          if (!verifyResponse.ok || verified.verified !== true) throw new Error(verified.error || "Payment verification failed. Do not pay again; contact support with your order number.");
          showMessage(`Payment verified successfully for order ${created.order_number ? `#${created.order_number}` : ""}.`, "success");
          await loadOrders(); navigate("orders");
        } catch (err) { showMessage(err.message || "Payment verification is pending. Please contact support.", "error"); await loadOrders(); navigate("orders"); }
      },
      modal: { ondismiss: async function () { showMessage("Checkout closed. Your order remains pending until payment is completed.", "info"); await loadOrders(); navigate("orders"); } }
    };
    if (typeof window.Razorpay !== "function") throw new Error("Razorpay Checkout did not load. Check your internet connection and retry.");
    new window.Razorpay(options).open();
  } catch (error) {
    fail(error?.message || "We could not start payment. Please try again.");
    const modal = $("orderCreateModal"); if (modal) { modal.hidden = false; modal.classList.add("active"); document.body.style.overflow = "hidden"; }
  } finally {
    if (submitButton) { submitButton.disabled = false; submitButton.innerHTML = '<i class="fa-solid fa-lock"></i> Continue to Payment'; }
  }
}

function statusMarkup(status) {
  const normalized = String(status || "pending").toLowerCase();
  const label = STATUS_LABELS[normalized] || normalized.replace(/_/g, " ");
  return `<span class="order-status status-${escapeHTML(normalized)}">${escapeHTML(label)}</span>`;
}

function orderRow(order) {
  const number = order.order_number ? `#${order.order_number}` : `#${String(order.id || "").slice(0, 8).toUpperCase()}`;
  return `<tr>
    <td><strong>${escapeHTML(number)}</strong></td>
    <td>${escapeHTML(order.service_name || "Service")}</td>
    <td>${escapeHTML(formatDate(order.created_at))}</td>
    <td>${escapeHTML(money(order.amount))}</td>
    <td>${statusMarkup(order.order_status)}</td>
  </tr>`;
}

function emptyRow(colspan, message) {
  return `<tr><td colspan="${colspan}" class="table-empty-state"><i class="fa-regular fa-clipboard"></i><span>${escapeHTML(message)}</span></td></tr>`;
}

function updateOrderStats(orders) {
  const total = orders.length;
  const completed = orders.filter((order) => order.order_status === "completed").length;
  const pending = orders.filter((order) => ["pending", "paid", "processing"].includes(order.order_status)).length;
  setText("totalOrdersCount", total);
  setText("completedOrdersCount", completed);
  setText("ordersPageTotal", total);
  setText("ordersPageCompleted", completed);
  setText("ordersPagePending", pending);
  setText("ordersCountLabel", `${total} ${total === 1 ? "order" : "orders"}`);
}

async function loadOrders() {
  if (!currentUser) return;
  const recentBody = $("recentOrdersBody");
  const ordersBody = $("ordersTableBody");
  if (recentBody && cachedOrders.length === 0) recentBody.innerHTML = emptyRow(5, "Loading your recent orders…");
  if (ordersBody && cachedOrders.length === 0) ordersBody.innerHTML = emptyRow(5, "Loading your orders…");

  const { data, error } = await supabase
    .from("orders")
    .select("id,order_number,service_id,service_name,amount,order_status,created_at,updated_at")
    .eq("user_id", currentUser.id)
    .order("created_at", { ascending: false })
    .limit(200);

  if (error) {
    const message = /row-level security|permission denied/i.test(error.message || "")
      ? "Your orders could not be read because Supabase RLS policies are not configured for customer order history."
      : "Could not load your orders. Please try again.";
    if (recentBody) recentBody.innerHTML = emptyRow(5, message);
    if (ordersBody) ordersBody.innerHTML = emptyRow(5, message);
    showMessage(`${message} (${error.message})`, "error");
    return;
  }

  cachedOrders = data || [];
  updateOrderStats(cachedOrders);
  const recent = cachedOrders.slice(0, 5);
  if (recentBody) recentBody.innerHTML = recent.length ? recent.map(orderRow).join("") : emptyRow(5, "No orders yet. Choose a service to place your first order.");
  if (ordersBody) ordersBody.innerHTML = cachedOrders.length ? cachedOrders.map(orderRow).join("") : emptyRow(5, "You have not placed any orders yet. Your orders will appear here.");
}

function renderNotifications() {
  const list = $("notificationsList");
  if (!list) return;
  const notifications = [];
  const pending = cachedOrders.filter((order) => order.order_status === "pending").length;
  const completed = cachedOrders.filter((order) => order.order_status === "completed").length;
  if (pending) notifications.push({ icon: "fa-clock", title: "Orders awaiting review", text: `${pending} order${pending === 1 ? "" : "s"} ${pending === 1 ? "is" : "are"} pending.` });
  if (completed) notifications.push({ icon: "fa-circle-check", title: "Orders completed", text: `${completed} of your orders ${completed === 1 ? "has" : "have"} been completed.` });
  if (!notifications.length) notifications.push({ icon: "fa-bell", title: "You're all caught up", text: "Order updates and important messages will appear here." });
  list.innerHTML = notifications.map((item) => `<li class="notification-item"><span class="notification-icon"><i class="fa-solid ${item.icon}"></i></span><div><strong>${escapeHTML(item.title)}</strong><p>${escapeHTML(item.text)}</p></div></li>`).join("");
  const badge = $("notificationBadge");
  if (badge) {
    const count = pending;
    badge.textContent = count ? String(count) : "";
    badge.hidden = !count;
  }
}

async function logout() {
  if (isLoggingOut) return;
  isLoggingOut = true;
  if (logoutButton) { logoutButton.disabled = true; logoutButton.textContent = "Signing out…"; }
  try {
    if (orderChannel) await supabase.removeChannel(orderChannel);
    await supabase.auth.signOut();
  } finally {
    window.location.replace("index.html");
  }
}
logoutButton?.addEventListener("click", logout);

async function initializeDashboard() {
  const { data, error } = await supabase.auth.getSession();
  if (error || !data?.session?.user) {
    window.location.replace("index.html");
    return;
  }

  currentUser = data.session.user;
  renderProfile(currentUser);

  // Existing static service-info modal remains supported for any legacy buttons.
  const serviceModal = $("serviceModal");
  const closeServiceModal = $("closeServiceModal");
  closeServiceModal?.addEventListener("click", () => {
    if (serviceModal) serviceModal.style.display = "none";
  });
  serviceModal?.addEventListener("click", (event) => {
    if (event.target === serviceModal) serviceModal.style.display = "none";
  });
  document.querySelectorAll("[data-service]").forEach((button) => {
    button.addEventListener("click", () => {
      const name = button.dataset.service;
      const service = cachedServices.find((item) => item.name === name);
      if (service) return openOrderModal(service);
      setText("serviceModalTitle", name || "Service details");
      setText("serviceModalDescription", "Please select this service from the current services list to place an order.");
      if (serviceModal) {
        serviceModal.hidden = false;
        serviceModal.style.display = "flex";
      }
    });
  });

  await Promise.all([loadServicesFromDatabase(), loadOrders()]);
  renderNotifications();

  // Refresh this user's order list when an order changes. Realtime is best-effort;
  // regular page navigation still reloads the latest data if Realtime isn't enabled.
  try {
    orderChannel = supabase.channel(`customer-orders-${currentUser.id}`)
      .on("postgres_changes", {
        event: "*", schema: "public", table: "orders",
        filter: `user_id=eq.${currentUser.id}`
      }, async () => {
        await loadOrders();
        renderNotifications();
      }).subscribe();
  } catch (error) {
    console.warn("Order realtime updates unavailable:", error);
  }

  supabase.auth.onAuthStateChange((event) => {
    if (event === "SIGNED_OUT" && !isLoggingOut) window.location.replace("index.html");
  });
}

initializeDashboard().catch((error) => {
  console.error("Dashboard initialization failed:", error);
  showMessage("Dashboard could not finish loading. Please refresh the page.", "error");
});

/* Small, self-contained styles for the new order dialog; existing dashboard CSS is untouched. */
const orderStyles = document.createElement("style");
orderStyles.textContent = `
#orderCreateModal[hidden]{display:none!important}
#orderCreateModal{position:fixed;inset:0;z-index:9999;display:flex;align-items:center;justify-content:center;padding:20px;background:rgba(22,17,48,.58);backdrop-filter:blur(7px);overflow-y:auto}
#orderCreateModal .order-create-card{position:relative;width:min(100%,560px);max-height:calc(100vh - 40px);overflow:auto;background:#fff;border-radius:22px;padding:28px;box-shadow:0 24px 80px rgba(24,15,65,.25);color:#24213a}
#orderCreateModal .modal-close{position:absolute;right:18px;top:18px;border:0;background:#f2efff;border-radius:50%;width:38px;height:38px;cursor:pointer;color:#5b43b5;font-size:18px}
#orderCreateModal .order-modal-heading{display:flex;gap:14px;align-items:center;padding-right:34px;margin-bottom:20px}
#orderCreateModal .order-modal-icon{display:grid;place-items:center;flex:0 0 48px;height:48px;border-radius:15px;background:#eee9ff;color:#6848cf;font-size:21px}
#orderCreateModal h2{margin:0 0 5px;font-size:23px}
#orderCreateModal .order-modal-heading p{margin:0;color:#77738a;font-size:13px}
#orderCreateModal .order-selected-service{display:flex;justify-content:space-between;align-items:center;gap:15px;padding:15px 16px;margin-bottom:20px;background:#f7f5ff;border:1px solid #e9e3ff;border-radius:14px}
#orderCreateModal .order-selected-service span{display:block;color:#7c7696;font-size:12px;margin-bottom:4px}
#orderCreateModal .order-selected-service strong{font-size:15px;color:#40316f}
#orderCreateModal .order-selected-service>strong{white-space:nowrap;color:#6547c7;font-size:18px}
#orderCreateModal label{display:block;margin:14px 0 7px;font-weight:600;font-size:13px;color:#403b55}
#orderCreateModal label span{color:#c43d60}
#orderCreateModal label small{font-weight:400;color:#858095}
#orderCreateModal input,#orderCreateModal textarea{display:block;width:100%;box-sizing:border-box;border:1px solid #e0ddeb;border-radius:11px;padding:12px 13px;font:inherit;font-size:14px;color:#28243a;background:#fff;outline:none}
#orderCreateModal input:focus,#orderCreateModal textarea:focus{border-color:#9277ee;box-shadow:0 0 0 3px rgba(146,119,238,.13)}
#orderCreateModal textarea{resize:vertical;min-height:86px}
#orderCreateModal .order-form-note{font-size:12px;color:#77738a;display:flex;gap:8px;align-items:center;margin:15px 0}
#orderCreateModal .order-form-note i{color:#5b9b7a}
#orderCreateModal .order-form-error{background:#fff0f0;color:#9b1c1c;border:1px solid #ffd1d1;border-radius:10px;padding:11px 12px;font-size:13px;margin:12px 0}
#orderCreateModal .order-form-actions{display:flex;justify-content:flex-end;gap:10px;margin-top:20px}
#orderCreateModal .order-form-actions button{border-radius:11px;padding:12px 18px;font:inherit;font-size:14px;font-weight:650;cursor:pointer}
#orderCreateModal .order-cancel-btn{border:1px solid #e1ddec;background:#fff;color:#5c5670}
#orderCreateModal .order-submit-btn{border:0;background:linear-gradient(135deg,#7658dc,#4c65d9);color:#fff;box-shadow:0 6px 16px rgba(93,77,197,.22)}
#orderCreateModal button:disabled{opacity:.65;cursor:wait}
#orderCreateModal .table-empty-state{text-align:center;padding:26px 12px;color:#817b94}
#orderCreateModal .service-loading{padding:20px;color:#817b94}
#orderCreateModal .empty-state{padding:18px;color:#817b94}
@media(max-width:520px){#orderCreateModal{padding:10px}#orderCreateModal .order-create-card{padding:22px 17px;max-height:calc(100vh - 20px);border-radius:17px}#orderCreateModal h2{font-size:20px}#orderCreateModal .order-form-actions button{flex:1;padding:12px 9px}}
`;
document.head.appendChild(orderStyles);
