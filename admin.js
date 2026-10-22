import { supabase } from "./supabase.js";

/*
 * GOPI ONLINE SERVICE — Admin Control Center
 *
 * Features:
 * - Admin session verification
 * - Dashboard statistics
 * - Services CRUD
 * - Orders and payments
 * - Customer references
 * - CSV export
 * - Search and filters
 * - Responsive sidebar
 * - Logout
 *
 * SECURITY:
 * Browser-side email verification is not sufficient security.
 * Protect all tables with correct Supabase RLS policies.
 * Never expose a service_role or secret key in frontend code.
 */

const ADMIN_EMAIL = "gopi742301@gmail.com";
const CURRENCY = "INR";

const $ = (selector, root = document) =>
    root.querySelector(selector);

const $$ = (selector, root = document) =>
    [...root.querySelectorAll(selector)];

const state = {
    session: null,
    user: null,
    services: [],
    orders: [],
    payments: [],
    activeSection: "overview",
    confirmAction: null,
    isLoading: false
};

const SECTION_CONFIG = {
    overview: {
        id: "adminOverviewSection",
        title: "Overview",
        heading: "Admin Overview"
    },
    services: {
        id: "adminServicesSection",
        title: "Services",
        heading: "Service Management"
    },
    orders: {
        id: "adminOrdersSection",
        title: "Orders",
        heading: "All Orders"
    },
    payments: {
        id: "adminPaymentsSection",
        title: "Payments",
        heading: "Payment Management"
    },
    customers: {
        id: "adminCustomersSection",
        title: "Customers",
        heading: "Customers"
    },
    notifications: {
        id: "adminNotificationsSection",
        title: "Notifications",
        heading: "Notifications"
    },
    settings: {
        id: "adminSettingsSection",
        title: "Settings",
        heading: "Settings"
    }
};

/* =========================
   GENERAL HELPERS
========================= */

function setText(id, value) {
    const node = document.getElementById(id);

    if (node) {
        node.textContent =
            value == null ? "" : String(value);
    }
}

function showMessage(
    message,
    type = "info",
    target = "adminGlobalMessage"
) {
    const node = document.getElementById(target);

    if (!node) return;

    node.textContent = message;
    node.className = `admin-message is-${type}`;
    node.hidden = false;
}

function clearMessage(target = "adminGlobalMessage") {
    const node = document.getElementById(target);

    if (node) {
        node.hidden = true;
        node.textContent = "";
    }
}

function formatMoney(value) {
    const amount = Number(value);

    if (!Number.isFinite(amount)) {
        return "—";
    }

    return new Intl.NumberFormat("en-IN", {
        style: "currency",
        currency: CURRENCY,
        maximumFractionDigits: 2
    }).format(amount);
}

function formatDate(value, includeTime = false) {
    if (!value) return "—";

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
        return "—";
    }

    const options = includeTime
        ? {
            dateStyle: "medium",
            timeStyle: "short"
        }
        : {
            dateStyle: "medium"
        };

    return new Intl.DateTimeFormat(
        "en-IN",
        options
    ).format(date);
}

function shortId(value, length = 12) {
    if (!value) return "—";

    const str = String(value);

    return str.length > length
        ? `${str.slice(0, 8)}…${str.slice(-4)}`
        : str;
}

function escapeHTML(value) {
    return String(value ?? "").replace(
        /[&<>"']/g,
        (char) => ({
            "&": "&amp;",
            "<": "&lt;",
            ">": "&gt;",
            '"': "&quot;",
            "'": "&#39;"
        })[char]
    );
}

function statusBadge(status) {
    const normalized = String(
        status || "unknown"
    ).toLowerCase();

    const safeClass = normalized.replace(
        /[^a-z0-9_-]/g,
        ""
    );

    return `
        <span class="admin-status-badge status-${safeClass}">
            ${escapeHTML(
                normalized.replaceAll("_", " ")
            )}
        </span>
    `;
}

function setLoading(loading) {
    state.isLoading = loading;

    const node = $("#adminLoading");

    if (node) {
        node.hidden = !loading;
    }
}

function setDatabaseStatus(
    ok,
    message,
    description = ""
) {
    const indicator = $(
        "#adminDatabaseIndicator"
    );

    if (indicator) {
        indicator.classList.toggle(
            "is-online",
            Boolean(ok)
        );

        indicator.classList.toggle(
            "is-offline",
            !ok
        );
    }

    setText("adminDatabaseStatus", message);
    setText(
        "adminDatabaseDescription",
        description
    );
}

function setEmptyRow(
    tbodyId,
    colspan,
    message,
    icon = "fa-circle-info"
) {
    const body = document.getElementById(tbodyId);

    if (!body) return;

    body.innerHTML = `
        <tr>
            <td
                colspan="${colspan}"
                class="admin-empty-cell"
            >
                <i class="fa-solid ${icon}"></i>
                <span>${escapeHTML(message)}</span>
            </td>
        </tr>
    `;
}

/* =========================
   SIDEBAR AND NAVIGATION
========================= */

function showSection(sectionName) {
    const config = SECTION_CONFIG[sectionName];

    if (!config) return;

    state.activeSection = sectionName;

    Object.entries(SECTION_CONFIG).forEach(
        ([key, item]) => {
            const section = document.getElementById(
                item.id
            );

            if (section) {
                section.hidden = key !== sectionName;

                section.classList.toggle(
                    "active",
                    key === sectionName
                );
            }
        }
    );

    $$("[data-admin-section]").forEach(
        (button) => {
            const active =
                button.dataset.adminSection ===
                sectionName;

            button.classList.toggle(
                "active",
                active
            );

            if (active) {
                button.setAttribute(
                    "aria-current",
                    "page"
                );
            } else {
                button.removeAttribute(
                    "aria-current"
                );
            }
        }
    );

    setText(
        "adminBreadcrumbCurrent",
        config.title
    );

    setText(
        "adminPageTitle",
        config.heading
    );

    closeMobileSidebar();

    if (sectionName === "services") {
        renderServices();
    }

    if (sectionName === "orders") {
        renderOrders();
    }

    if (sectionName === "payments") {
        renderPayments();
    }

    if (sectionName === "customers") {
        renderCustomers();
    }
}

function openMobileSidebar() {
    $("#adminSidebar")?.classList.add("is-open");

    $("#adminSidebarOverlay")?.classList.add(
        "is-visible"
    );

    $("#adminMenuToggle")?.setAttribute(
        "aria-expanded",
        "true"
    );
}

function closeMobileSidebar() {
    $("#adminSidebar")?.classList.remove(
        "is-open"
    );

    $("#adminSidebarOverlay")?.classList.remove(
        "is-visible"
    );

    $("#adminMenuToggle")?.setAttribute(
        "aria-expanded",
        "false"
    );
}

/* =========================
   AUTHENTICATION
========================= */

async function logout() {
    try {
        const { error } =
            await supabase.auth.signOut();

        if (error) {
            console.error(
                "Logout error:",
                error
            );
        }
    } finally {
        window.location.replace("./index.html");
    }
}

async function verifyAdminSession() {
    const { data, error } =
        await supabase.auth.getSession();

    if (error) {
        throw error;
    }

    const session = data?.session;

    if (!session?.user) {
        window.location.replace("./index.html");
        return false;
    }

    const email = String(
        session.user.email || ""
    ).toLowerCase();

    if (
        email !== ADMIN_EMAIL.toLowerCase()
    ) {
        await supabase.auth.signOut();

        window.location.replace("./index.html");

        return false;
    }

    state.session = session;
    state.user = session.user;

    const displayName =
        session.user.user_metadata?.full_name ||
        session.user.user_metadata?.name ||
        "Administrator";

    setText("adminAccountName", displayName);

    setText(
        "adminAccountEmail",
        session.user.email || ""
    );

    setText(
        "adminWelcomeName",
        displayName
    );

    setText(
        "settingsAdminEmail",
        session.user.email || ""
    );

    setText(
        "settingsAuthStatus",
        "Authenticated"
    );

    setText(
        "adminCurrentDate",
        new Intl.DateTimeFormat("en-IN", {
            weekday: "long",
            day: "numeric",
            month: "long",
            year: "numeric"
        }).format(new Date())
    );

    setText(
        "adminCurrentYear",
        new Date().getFullYear()
    );

    return true;
}

/* =========================
   FETCH SUPABASE DATA
========================= */

async function fetchServices() {
    const { data, error } = await supabase
        .from("services")
        .select(
            "id, name, description, price, is_active, created_at"
        )
        .order("created_at", {
            ascending: false
        });

    if (error) throw error;

    state.services = data || [];
}

async function fetchOrders() {
    const { data, error } = await supabase
        .from("orders")
        .select(
            "id, order_number, user_id, service_id, service_name, amount, order_status, customer_name, customer_mobile, customer_notes, created_at, updated_at"
        )
        .order("created_at", {
            ascending: false
        })
        .limit(500);

    if (error) throw error;

    state.orders = data || [];
}

async function fetchPayments() {
    const { data, error } = await supabase
        .from("payments")
        .select(
            "id, order_id, user_id, amount, payment_method, payment_status, gateway_reference, created_at"
        )
        .order("created_at", {
            ascending: false
        })
        .limit(500);

    if (error) throw error;

    state.payments = data || [];
}

/* =========================
   REFRESH ALL DATA
========================= */

async function refreshAll({
    quiet = false
} = {}) {
    if (state.isLoading) return;

    setLoading(true);
    clearMessage();

    try {
        const results = await Promise.allSettled([
            fetchServices(),
            fetchOrders(),
            fetchPayments()
        ]);

        const labels = [
            "Services",
            "Orders",
            "Payments"
        ];

        const errors = [];

        results.forEach((result, index) => {
            if (result.status === "rejected") {
                errors.push(
                    `${labels[index]}: ${
                        result.reason?.message ||
                        "could not load"
                    }`
                );
            }
        });

        renderAll();

        setText(
            "adminLastRefresh",
            `Updated ${new Date().toLocaleTimeString(
                "en-IN",
                {
                    hour: "2-digit",
                    minute: "2-digit"
                }
            )}`
        );

        if (errors.length === 0) {
            setDatabaseStatus(
                true,
                "Connected",
                "Supabase responded successfully for all admin tables."
            );
        } else {
            setDatabaseStatus(
                false,
                "Partially available",
                errors.join(" • ")
            );

            if (!quiet) {
                showMessage(
                    "Some records could not be loaded. " +
                    "Check Supabase RLS policies and table access. " +
                    errors.join(" | "),
                    "warning"
                );
            }
        }
    } catch (error) {
        setDatabaseStatus(
            false,
            "Connection error",
            error?.message ||
            "Unable to read database."
        );

        if (!quiet) {
            showMessage(
                error?.message ||
                "Could not refresh database records.",
                "error"
            );
        }
    } finally {
        setLoading(false);
    }
}

function renderAll() {
    renderServices();
    renderOrders();
    renderPayments();
    renderCustomers();
    renderOverview();
}

/* =========================
   DASHBOARD OVERVIEW
========================= */

function renderOverview() {
    const active = state.services.filter(
        (service) => service.is_active
    ).length;

    const inactive =
        state.services.length - active;

    setText(
        "statTotalServices",
        state.services.length
    );

    setText(
        "statTotalOrders",
        state.orders.length
    );

    setText(
        "statTotalPayments",
        state.payments.length
    );

    setText(
        "statActiveServices",
        active
    );

    setText(
        "overviewActiveServices",
        active
    );

    setText(
        "overviewInactiveServices",
        inactive
    );

    setText(
        "sidebarServicesCount",
        state.services.length
    );

    setText(
        "sidebarOrdersCount",
        state.orders.length
    );

    setText(
        "servicesPageTotal",
        state.services.length
    );

    setText(
        "servicesPageActive",
        active
    );

    setText(
        "servicesPageInactive",
        inactive
    );

    setText(
        "ordersPageTotal",
        state.orders.length
    );

    setText(
        "ordersPageCustomers",
        new Set(
            state.orders
                .map((order) => order.user_id)
                .filter(Boolean)
        ).size
    );

    setText(
        "paymentsPageTotal",
        state.payments.length
    );

    setText(
        "paymentsPageAmount",
        formatMoney(
            state.payments.reduce(
                (sum, payment) =>
                    sum + Number(payment.amount || 0),
                0
            )
        )
    );

    setText(
        "servicesRecordCount",
        `${filteredServices().length} records`
    );

    setText(
        "ordersRecordCount",
        `${filteredOrders().length} records`
    );

    setText(
        "paymentsRecordCount",
        `${filteredPayments().length} records`
    );

    setText(
        "customersRecordCount",
        `${customerRows().length} customers`
    );

    setText(
        "adminNotificationCount",
        "0"
    );

    const recentBody = $(
        "#adminRecentOrdersBody"
    );

    if (!recentBody) return;

    const recent = state.orders.slice(0, 5);

    recentBody.innerHTML = recent.length
        ? recent.map((order) => `
            <tr>
                <td>
                    <strong>
                        #${escapeHTML(order.order_number)}
                    </strong>
                </td>

                <td>
                    <code title="${escapeHTML(order.user_id)}">
                        ${escapeHTML(shortId(order.user_id))}
                    </code>
                </td>

                <td>
                    ${escapeHTML(order.service_name || "—")}
                </td>

                <td>
                    <code title="${escapeHTML(order.id)}">
                        ${escapeHTML(shortId(order.id))}
                    </code>
                </td>
            </tr>
        `).join("")
        : `
            <tr>
                <td colspan="4" class="admin-empty-cell">
                    <i class="fa-solid fa-box-open"></i>
                    <span>No orders are visible yet.</span>
                </td>
            </tr>
        `;
}
/* =========================
   SERVICES
========================= */

function filteredServices() {
    const query = (
        $("#serviceSearch")?.value || ""
    ).trim().toLowerCase();

    const status =
        $("#serviceStatusFilter")?.value || "all";

    return state.services.filter((service) => {
        const searchableText =
            `${service.name || ""} ${
                service.description || ""
            }`.toLowerCase();

        const matchesQuery =
            searchableText.includes(query);

        const matchesStatus =
            status === "all" ||
            (
                status === "active"
                    ? service.is_active
                    : !service.is_active
            );

        return matchesQuery && matchesStatus;
    });
}

function renderServices() {
    const body = $("#adminServicesBody");

    if (!body) return;

    const services = filteredServices();

    setText(
        "servicesRecordCount",
        `${services.length} records`
    );

    setText(
        "servicesPageTotal",
        state.services.length
    );

    setText(
        "servicesPageActive",
        state.services.filter(
            (service) => service.is_active
        ).length
    );

    setText(
        "servicesPageInactive",
        state.services.filter(
            (service) => !service.is_active
        ).length
    );

    if (!services.length) {
        setEmptyRow(
            "adminServicesBody",
            6,
            state.services.length
                ? "No services match your filters."
                : "No services found. Add your first service.",
            "fa-layer-group"
        );

        return;
    }

    body.innerHTML = services.map(
        (service) => `
            <tr>
                <td>
                    <div class="admin-service-cell">
                        <span class="admin-table-avatar">
                            <i class="fa-solid fa-layer-group"></i>
                        </span>

                        <strong>
                            ${escapeHTML(service.name)}
                        </strong>
                    </div>
                </td>

                <td class="admin-description-cell">
                    ${escapeHTML(service.description || "—")}
                </td>

                <td>
                    <strong>
                        ${escapeHTML(formatMoney(service.price))}
                    </strong>
                </td>

                <td>
                    ${statusBadge(
                        service.is_active
                            ? "active"
                            : "inactive"
                    )}
                </td>

                <td>
                    ${escapeHTML(
                        formatDate(service.created_at)
                    )}
                </td>

                <td>
                    <div class="admin-table-actions">
                        <button
                            type="button"
                            class="admin-table-action"
                            data-edit-service="${escapeHTML(service.id)}"
                            aria-label="Edit ${escapeHTML(service.name)}"
                            title="Edit service"
                        >
                            <i class="fa-solid fa-pen"></i>
                        </button>

                        <button
                            type="button"
                            class="admin-table-action"
                            data-toggle-service="${escapeHTML(service.id)}"
                            title="${
                                service.is_active
                                    ? "Deactivate"
                                    : "Activate"
                            } service"
                            aria-label="${
                                service.is_active
                                    ? "Deactivate"
                                    : "Activate"
                            } ${escapeHTML(service.name)}"
                        >
                            <i class="fa-solid ${
                                service.is_active
                                    ? "fa-toggle-on"
                                    : "fa-toggle-off"
                            }"></i>
                        </button>

                        <button
                            type="button"
                            class="admin-table-action is-danger"
                            data-delete-service="${escapeHTML(service.id)}"
                            title="Delete service"
                            aria-label="Delete ${escapeHTML(service.name)}"
                        >
                            <i class="fa-solid fa-trash"></i>
                        </button>
                    </div>
                </td>
            </tr>
        `
    ).join("");
}

/* =========================
   ORDERS
========================= */

function filteredOrders() {
    const query = (
        $("#orderSearch")?.value || ""
    ).trim().toLowerCase();

    return state.orders.filter((order) =>
        [
            order.order_number,
            order.user_id,
            order.service_name,
            order.id,
            order.order_status,
            order.customer_name
        ].some((value) =>
            String(value ?? "")
                .toLowerCase()
                .includes(query)
        )
    );
}

function renderOrders() {
    const body = $("#adminOrdersBody");

    if (!body) return;

    const orders = filteredOrders();

    setText(
        "ordersRecordCount",
        `${orders.length} records`
    );

    if (!orders.length) {
        setEmptyRow(
            "adminOrdersBody",
            4,
            state.orders.length
                ? "No orders match your search."
                : "No orders are visible. Check the orders table and RLS policies.",
            "fa-box-open"
        );

        return;
    }

    body.innerHTML = orders.map(
        (order) => `
            <tr>
                <td>
                    <strong>
                        #${escapeHTML(order.order_number)}
                    </strong>

                    <div class="admin-muted">
                        ${escapeHTML(
                            formatDate(order.created_at, true)
                        )}
                    </div>
                </td>

                <td>
                    <code title="${escapeHTML(order.user_id)}">
                        ${escapeHTML(shortId(order.user_id))}
                    </code>
                </td>

                <td>
                    <strong>
                        ${escapeHTML(order.service_name || "—")}
                    </strong>

                    <div class="admin-muted">
                        ${statusBadge(order.order_status)}
                    </div>
                </td>

                <td>
                    <code title="${escapeHTML(order.id)}">
                        ${escapeHTML(shortId(order.id))}
                    </code>
                </td>
            </tr>
        `
    ).join("");
}

/* =========================
   PAYMENTS
========================= */

function filteredPayments() {
    const query = (
        $("#paymentSearch")?.value || ""
    ).trim().toLowerCase();

    return state.payments.filter((payment) =>
        [
            payment.id,
            payment.order_id,
            payment.user_id,
            payment.amount,
            payment.payment_method,
            payment.payment_status,
            payment.gateway_reference
        ].some((value) =>
            String(value ?? "")
                .toLowerCase()
                .includes(query)
        )
    );
}

function renderPayments() {
    const body = $("#adminPaymentsBody");

    if (!body) return;

    const payments = filteredPayments();

    setText(
        "paymentsRecordCount",
        `${payments.length} records`
    );

    if (!payments.length) {
        setEmptyRow(
            "adminPaymentsBody",
            5,
            state.payments.length
                ? "No payments match your search."
                : "No payments are visible. Check the payments table and RLS policies.",
            "fa-wallet"
        );

        return;
    }

    body.innerHTML = payments.map(
        (payment) => `
            <tr>
                <td>
                    <code title="${escapeHTML(payment.id)}">
                        ${escapeHTML(shortId(payment.id))}
                    </code>
                </td>

                <td>
                    <code title="${escapeHTML(payment.order_id)}">
                        ${escapeHTML(shortId(payment.order_id))}
                    </code>
                </td>

                <td>
                    <code title="${escapeHTML(payment.user_id)}">
                        ${escapeHTML(shortId(payment.user_id))}
                    </code>
                </td>

                <td>
                    <strong>
                        ${escapeHTML(formatMoney(payment.amount))}
                    </strong>
                </td>

                <td>
                    ${statusBadge(payment.payment_status)}

                    <div class="admin-muted">
                        ${escapeHTML(
                            payment.payment_method ||
                            "Method not specified"
                        )}

                        ${
                            payment.gateway_reference
                                ? ` · Ref: ${escapeHTML(
                                    payment.gateway_reference
                                )}`
                                : ""
                        }
                    </div>
                </td>
            </tr>
        `
    ).join("");
}

/* =========================
   CUSTOMERS
========================= */

function customerRows() {
    const map = new Map();

    state.orders.forEach((order) => {
        if (!order.user_id) return;

        const current = map.get(order.user_id) || {
            user_id: order.user_id,
            orders: 0
        };

        current.orders += 1;

        map.set(order.user_id, current);
    });

    const query = (
        $("#customerSearch")?.value || ""
    ).trim().toLowerCase();

    return [...map.values()]
        .filter((row) =>
            row.user_id.toLowerCase().includes(query)
        )
        .sort((a, b) => b.orders - a.orders);
}

function renderCustomers() {
    const body = $("#adminCustomersBody");

    if (!body) return;

    const customers = customerRows();

    setText(
        "customersRecordCount",
        `${customers.length} customers`
    );

    if (!customers.length) {
        setEmptyRow(
            "adminCustomersBody",
            2,
            "No customer references are visible yet.",
            "fa-users"
        );

        return;
    }

    body.innerHTML = customers.map(
        (customer) => `
            <tr>
                <td>
                    <code title="${escapeHTML(customer.user_id)}">
                        ${escapeHTML(customer.user_id)}
                    </code>
                </td>

                <td>
                    <span class="admin-record-count">
                        ${customer.orders}
                    </span>
                </td>
            </tr>
        `
    ).join("");
}

/* =========================
   SERVICE EDITOR MODAL
========================= */

function openServiceEditor(service = null) {
    const form = $("#serviceEditorForm");

    if (!form) return;

    form.reset();

    clearMessage("serviceEditorMessage");

    setText(
        "serviceEditorTitle",
        service ? "Edit Service" : "Add New Service"
    );

    $("#serviceEditorId").value =
        service?.id || "";

    $("#serviceEditorName").value =
        service?.name || "";

    $("#serviceEditorDescription").value =
        service?.description || "";

    $("#serviceEditorPrice").value =
        service?.price ?? "";

    $("#serviceEditorActive").checked =
        service
            ? Boolean(service.is_active)
            : true;

    $("#serviceEditorModal").hidden = false;

    document.body.classList.add(
        "admin-modal-open"
    );

    window.setTimeout(() => {
        $("#serviceEditorName")?.focus();
    }, 50);
}

function closeServiceEditor() {
    const modal = $("#serviceEditorModal");

    if (modal) {
        modal.hidden = true;
    }

    document.body.classList.remove(
        "admin-modal-open"
    );
}

/* =========================
   CONFIRMATION MODAL
========================= */

function askConfirm({
    title,
    message,
    acceptLabel = "Confirm",
    action
}) {
    setText("adminConfirmTitle", title);

    setText(
        "adminConfirmMessage",
        message
    );

    const accept = $("#acceptAdminConfirm");

    if (accept) {
        accept.textContent = acceptLabel;
    }

    state.confirmAction = action;

    const modal = $("#adminConfirmModal");

    if (modal) {
        modal.hidden = false;
    }

    document.body.classList.add(
        "admin-modal-open"
    );
}

function closeConfirm() {
    const modal = $("#adminConfirmModal");

    if (modal) {
        modal.hidden = true;
    }

    document.body.classList.remove(
        "admin-modal-open"
    );

    state.confirmAction = null;
}

/* =========================
   SAVE SERVICE
========================= */

async function saveService(event) {
    event.preventDefault();

    const id = $("#serviceEditorId").value.trim();

    const name = $("#serviceEditorName")
        .value.trim();

    const description = $(
        "#serviceEditorDescription"
    ).value.trim();

    const price = Number(
        $("#serviceEditorPrice").value
    );

    const is_active = $(
        "#serviceEditorActive"
    ).checked;

    if (!name) {
        showMessage(
            "Please enter a service name.",
            "warning",
            "serviceEditorMessage"
        );

        return;
    }

    if (
        !Number.isFinite(price) ||
        price < 0
    ) {
        showMessage(
            "Enter a valid non-negative price.",
            "warning",
            "serviceEditorMessage"
        );

        return;
    }

    const button = $("#saveServiceButton");

    if (!button) return;

    const original = button.innerHTML;

    button.disabled = true;

    button.innerHTML = `
        <i class="fa-solid fa-spinner fa-spin"></i>
        Saving...
    `;

    try {
        const payload = {
            name,
            description,
            price,
            is_active
        };

        let result;

        if (id) {
            result = await supabase
                .from("services")
                .update(payload)
                .eq("id", id)
                .select("id")
                .single();
        } else {
            result = await supabase
                .from("services")
                .insert(payload)
                .select("id")
                .single();
        }

        if (result.error) {
            throw result.error;
        }

        closeServiceEditor();

        showMessage(
            id
                ? "Service updated successfully."
                : "Service created successfully.",
            "success"
        );

        await refreshAll({
            quiet: true
        });
    } catch (error) {
        showMessage(
            error?.message ||
            "Could not save service. Check your Supabase permissions.",
            "error",
            "serviceEditorMessage"
        );
    } finally {
        button.disabled = false;
        button.innerHTML = original;
    }
}

/* =========================
   ACTIVATE / DEACTIVATE
========================= */

async function toggleService(serviceId) {
    const service = state.services.find(
        (item) => item.id === serviceId
    );

    if (!service) return;

    const nextActive = !service.is_active;

    askConfirm({
        title: nextActive
            ? "Activate service?"
            : "Deactivate service?",

        message: `${
            nextActive ? "Make" : "Hide"
        } "${service.name}" ${
            nextActive
                ? "available"
                : "unavailable"
        } to customers?`,

        acceptLabel: nextActive
            ? "Activate"
            : "Deactivate",

        action: async () => {
            const { error } = await supabase
                .from("services")
                .update({
                    is_active: nextActive
                })
                .eq("id", serviceId);

            if (error) throw error;

            showMessage(
                `Service ${
                    nextActive
                        ? "activated"
                        : "deactivated"
                } successfully.`,
                "success"
            );

            await refreshAll({
                quiet: true
            });
        }
    });
}

/* =========================
   DELETE SERVICE
========================= */

async function deleteService(serviceId) {
    const service = state.services.find(
        (item) => item.id === serviceId
    );

    if (!service) return;

    askConfirm({
        title: "Delete service?",

        message:
            `Delete "${service.name}" permanently? ` +
            "Services referenced by orders may be protected by the database.",

        acceptLabel: "Delete service",

        action: async () => {
            const { error } = await supabase
                .from("services")
                .delete()
                .eq("id", serviceId);

            if (error) throw error;

            showMessage(
                "Service deleted successfully.",
                "success"
            );

            await refreshAll({
                quiet: true
            });
        }
    });
}
/* =========================
   CONFIRM ACTION
========================= */

async function acceptConfirm() {
    const action = state.confirmAction;

    if (!action) return;

    const button = $("#acceptAdminConfirm");

    if (!button) return;

    const oldText = button.textContent;

    button.disabled = true;
    button.textContent = "Please wait...";

    try {
        closeConfirm();

        await action();
    } catch (error) {
        showMessage(
            error?.message ||
            "Action failed. Check Supabase permissions.",
            "error"
        );
    } finally {
        button.disabled = false;
        button.textContent = oldText;
    }
}

/* =========================
   EXPORT ORDERS TO CSV
========================= */

function exportOrdersCSV() {
    const rows = filteredOrders();

    if (!rows.length) {
        showMessage(
            "There are no order records to export.",
            "warning"
        );

        return;
    }

    const columns = [
        ["order_number", "Order Number"],
        ["id", "Order ID"],
        ["user_id", "User ID"],
        ["service_name", "Service"],
        ["amount", "Amount"],
        ["order_status", "Status"],
        ["customer_name", "Customer Name"],
        ["customer_mobile", "Customer Mobile"],
        ["created_at", "Created At"]
    ];

    const quote = (value) =>
        `"${String(value ?? "").replace(/"/g, '""')}"`;

    const csv = [
        columns
            .map(([, label]) => quote(label))
            .join(","),

        ...rows.map((row) =>
            columns
                .map(([key]) => quote(row[key]))
                .join(",")
        )
    ].join("\r\n");

    const blob = new Blob(
        ["\uFEFF", csv],
        {
            type: "text/csv;charset=utf-8;"
        }
    );

    const url = URL.createObjectURL(blob);

    const link = document.createElement("a");

    link.href = url;

    link.download =
        `gopi-orders-${
            new Date().toISOString().slice(0, 10)
        }.csv`;

    document.body.appendChild(link);

    link.click();

    link.remove();

    URL.revokeObjectURL(url);
}

/* =========================
   EVENT LISTENERS
========================= */

function bindEvents() {
    /* Navigation */

    $$("[data-admin-section]").forEach(
        (button) => {
            button.addEventListener(
                "click",
                () => {
                    showSection(
                        button.dataset.adminSection
                    );
                }
            );
        }
    );

    /* Mobile sidebar */

    $("#adminMenuToggle")?.addEventListener(
        "click",
        () => {
            if (
                $("#adminSidebar")
                    ?.classList.contains("is-open")
            ) {
                closeMobileSidebar();
            } else {
                openMobileSidebar();
            }
        }
    );

    $("#adminSidebarOverlay")?.addEventListener(
        "click",
        closeMobileSidebar
    );

    /* Refresh buttons */

    $("#adminRefreshButton")?.addEventListener(
        "click",
        () => refreshAll()
    );

    $("#adminOverviewRefresh")?.addEventListener(
        "click",
        () => refreshAll()
    );

    $("#refreshServicesButton")?.addEventListener(
        "click",
        () => refreshAll()
    );

    $("#refreshOrdersButton")?.addEventListener(
        "click",
        () => refreshAll()
    );

    $("#refreshPaymentsButton")?.addEventListener(
        "click",
        () => refreshAll()
    );

    $("#refreshCustomersButton")?.addEventListener(
        "click",
        () => refreshAll()
    );

    /* Search and filters */

    $("#serviceSearch")?.addEventListener(
        "input",
        renderServices
    );

    $("#serviceStatusFilter")?.addEventListener(
        "change",
        renderServices
    );

    $("#orderSearch")?.addEventListener(
        "input",
        renderOrders
    );

    $("#paymentSearch")?.addEventListener(
        "input",
        renderPayments
    );

    $("#customerSearch")?.addEventListener(
        "input",
        renderCustomers
    );

    /* Service editor */

    $("#addServiceButton")?.addEventListener(
        "click",
        () => openServiceEditor()
    );

    $("#serviceEditorForm")?.addEventListener(
        "submit",
        saveService
    );

    $("#closeServiceEditor")?.addEventListener(
        "click",
        closeServiceEditor
    );

    $("#cancelServiceEditor")?.addEventListener(
        "click",
        closeServiceEditor
    );

    $("#serviceEditorModal")?.addEventListener(
        "click",
        (event) => {
            if (
                event.target ===
                $("#serviceEditorModal")
            ) {
                closeServiceEditor();
            }
        }
    );

    /* Service table actions */

    $("#adminServicesBody")?.addEventListener(
        "click",
        (event) => {
            const editButton = event.target.closest(
                "[data-edit-service]"
            );

            const toggleButton = event.target.closest(
                "[data-toggle-service]"
            );

            const deleteButton = event.target.closest(
                "[data-delete-service]"
            );

            if (editButton) {
                const service = state.services.find(
                    (item) =>
                        item.id ===
                        editButton.dataset.editService
                );

                if (service) {
                    openServiceEditor(service);
                }
            } else if (toggleButton) {
                toggleService(
                    toggleButton.dataset.toggleService
                );
            } else if (deleteButton) {
                deleteService(
                    deleteButton.dataset.deleteService
                );
            }
        }
    );

    /* Confirmation modal */

    $("#cancelAdminConfirm")?.addEventListener(
        "click",
        closeConfirm
    );

    $("#acceptAdminConfirm")?.addEventListener(
        "click",
        acceptConfirm
    );

    $("#adminConfirmModal")?.addEventListener(
        "click",
        (event) => {
            if (
                event.target ===
                $("#adminConfirmModal")
            ) {
                closeConfirm();
            }
        }
    );

    /* Logout */

    $("#adminLogoutButton")?.addEventListener(
        "click",
        logout
    );

    $("#settingsLogoutButton")?.addEventListener(
        "click",
        logout
    );

    /* CSV export */

    $("#exportOrdersButton")?.addEventListener(
        "click",
        exportOrdersCSV
    );

    /* Escape key closes modals/sidebar */

    document.addEventListener(
        "keydown",
        (event) => {
            if (event.key === "Escape") {
                closeServiceEditor();
                closeConfirm();
                closeMobileSidebar();
            }
        }
    );
}

/* =========================
   INITIALIZATION
========================= */

async function init() {
    bindEvents();

    setText(
        "adminCurrentYear",
        new Date().getFullYear()
    );

    setDatabaseStatus(
        false,
        "Checking connection...",
        "Connecting to Supabase."
    );

    try {
        const allowed =
            await verifyAdminSession();

        if (!allowed) return;

        await refreshAll();
    } catch (error) {
        setDatabaseStatus(
            false,
            "Initialization failed",
            error?.message ||
            "Unable to initialize admin panel."
        );

        showMessage(
            error?.message ||
            "Could not initialize admin panel.",
            "error"
        );
    } finally {
        setLoading(false);
    }
}

/* Start after HTML has loaded */

if (document.readyState === "loading") {
    document.addEventListener(
        "DOMContentLoaded",
        init,
        { once: true }
    );
} else {
    init();
}
