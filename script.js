/* =====================================================
   GOPI ONLINE CENTRE
   Premium Login / Register Interactions
   Responsive UI + Form Validation
===================================================== */

"use strict";


/* ---------- ELEMENTS ---------- */

const loginPanel = document.getElementById("loginPanel");
const registerPanel = document.getElementById("registerPanel");

const showRegisterButton = document.getElementById("showRegister");
const showLoginButton = document.getElementById("showLogin");

const loginForm = document.getElementById("loginForm");
const registerForm = document.getElementById("registerForm");

const loginMessage = document.getElementById("loginMessage");
const registerMessage = document.getElementById("registerMessage");

const loginButton = document.getElementById("loginButton");
const registerButton = document.getElementById("registerButton");

const forgotPasswordButton = document.getElementById("forgotPasswordBtn");

const loginPassword = document.getElementById("loginPassword");
const registerPassword = document.getElementById("registerPassword");

const toggleLoginPassword = document.getElementById("toggleLoginPassword");
const toggleRegisterPassword = document.getElementById("toggleRegisterPassword");

const registerName = document.getElementById("registerName");
const registerEmail = document.getElementById("registerEmail");
const registerPhone = document.getElementById("registerPhone");

const loginEmail = document.getElementById("loginEmail");


/* ---------- HELPERS ---------- */

function showMessage(element, message, type = "info") {
    if (!element) return;

    element.textContent = message;
    element.className = `form-message ${type}`;
}


function clearMessage(element) {
    if (!element) return;

    element.textContent = "";
    element.className = "form-message";
}


function setButtonLoading(button, loading, text) {
    if (!button) return;

    const buttonText = button.querySelector(".button-text");

    if (loading) {
        button.disabled = true;
        button.setAttribute("aria-busy", "true");

        if (buttonText) {
            buttonText.textContent = text || "Please wait...";
        }
    } else {
        button.disabled = false;
        button.removeAttribute("aria-busy");

        if (buttonText) {
            buttonText.textContent =
                button.dataset.originalText || text || "Continue";
        }
    }
}


/* Save original button labels */

if (loginButton) {
    loginButton.dataset.originalText = "Login";
}

if (registerButton) {
    registerButton.dataset.originalText = "Create Account";
}


/* ---------- SWITCH PANELS ---------- */

function showLogin() {
    registerPanel.classList.remove("active");
    loginPanel.classList.add("active");

    clearMessage(loginMessage);
    clearMessage(registerMessage);

    loginForm.reset();

    window.setTimeout(() => {
        loginEmail.focus({ preventScroll: true });
    }, 150);
}


function showRegister() {
    loginPanel.classList.remove("active");
    registerPanel.classList.add("active");

    clearMessage(loginMessage);
    clearMessage(registerMessage);

    registerForm.reset();

    window.setTimeout(() => {
        registerName.focus({ preventScroll: true });
    }, 150);
}


showRegisterButton.addEventListener("click", showRegister);
showLoginButton.addEventListener("click", showLogin);


/* ---------- PASSWORD SHOW / HIDE ---------- */

function setupPasswordToggle(input, button) {
    if (!input || !button) return;

    button.addEventListener("click", () => {
        const isPassword = input.type === "password";

        input.type = isPassword ? "text" : "password";

        const icon = button.querySelector("i");

        if (icon) {
            icon.classList.toggle("fa-eye", isPassword);
            icon.classList.toggle("fa-eye-slash", !isPassword);
        }

        button.setAttribute(
            "aria-label",
            isPassword ? "Hide password" : "Show password"
        );

        button.setAttribute(
            "aria-pressed",
            String(isPassword)
        );

        input.focus({ preventScroll: true });
    });
}


setupPasswordToggle(loginPassword, toggleLoginPassword);
setupPasswordToggle(registerPassword, toggleRegisterPassword);


/* ---------- INPUT VALIDATION HELPERS ---------- */

function isValidEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}


function isValidIndianMobile(phone) {
    return /^[6-9]\d{9}$/.test(phone);
}


/* ---------- REGISTER MOBILE INPUT ---------- */

registerPhone.addEventListener("input", () => {
    registerPhone.value = registerPhone.value
        .replace(/\D/g, "")
        .slice(0, 10);
});


/* ---------- INPUT INTERACTIONS ---------- */

document.querySelectorAll(".input-shell input").forEach((input) => {

    input.addEventListener("input", () => {
        const form = input.closest("form");

        if (form === loginForm) {
            clearMessage(loginMessage);
        }

        if (form === registerForm) {
            clearMessage(registerMessage);
        }
    });

});


/* ---------- LOGIN FORM ---------- */

/* ---------- SUPABASE LOGIN ---------- */

loginForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    clearMessage(loginMessage);

    const identifier = loginEmail.value.trim();
    const password = loginPassword.value;

    if (!identifier) {
        showMessage(
            loginMessage,
            "Please enter your registered email address.",
            "error"
        );
        loginEmail.focus();
        return;
    }

    if (!isValidEmail(identifier)) {
        showMessage(
            loginMessage,
            "Please enter a valid email address.",
            "error"
        );
        loginEmail.focus();
        return;
    }

    if (!password) {
        showMessage(
            loginMessage,
            "Please enter your password.",
            "error"
        );
        loginPassword.focus();
        return;
    }

    setButtonLoading(loginButton, true, "Signing in...");

    try {
        // Connect to the existing Supabase configuration
        const { supabase } = await import("./supabase.js");

        const { data, error } = await supabase.auth.signInWithPassword({
            email: identifier,
            password: password
        });

        if (error) {
            throw error;
        }

        if (!data.session) {
            showMessage(
                loginMessage,
                "Login was not completed. Please verify your email and try again.",
                "error"
            );
            return;
        }

        showMessage(
            loginMessage,
            "Login successful! Opening your dashboard...",
            "success"
        );

        window.setTimeout(() => {
            window.location.replace("./dashboard.html");
        }, 500);

    } catch (error) {
        console.error("Supabase login error:", error);

        let message = "Login failed. Please try again.";

        if (
            error.message &&
            error.message.toLowerCase().includes("invalid login credentials")
        ) {
            message = "Incorrect email or password.";
        } else if (
            error.message &&
            error.message.toLowerCase().includes("email not confirmed")
        ) {
            message = "Please verify your email before logging in.";
        } else if (
            error.message &&
            error.message.toLowerCase().includes("network")
        ) {
            message = "Network error. Please check your internet connection.";
        }

        showMessage(loginMessage, message, "error");

    } finally {
        setButtonLoading(loginButton, false);
    }
});

/* ---------- REGISTER FORM ---------- */

registerForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    clearMessage(registerMessage);

    const name = registerName.value.trim();
    const email = registerEmail.value.trim();
    const phone = registerPhone.value.trim();
    const password = registerPassword.value;

    if (name.length < 2) {
        showMessage(
            registerMessage,
            "Please enter your full name.",
            "error"
        );

        registerName.focus();
        return;
    }

    if (!isValidEmail(email)) {
        showMessage(
            registerMessage,
            "Please enter a valid email address.",
            "error"
        );

        registerEmail.focus();
        return;
    }

    if (!isValidIndianMobile(phone)) {
        showMessage(
            registerMessage,
            "Please enter a valid 10-digit Indian mobile number.",
            "error"
        );

        registerPhone.focus();
        return;
    }

    if (password.length < 8) {
        showMessage(
            registerMessage,
            "Your password must contain at least 8 characters.",
            "error"
        );

        registerPassword.focus();
        return;
    }

    setButtonLoading(registerButton, true, "Please wait...");

    await new Promise((resolve) => {
        window.setTimeout(resolve, 450);
    });

    setButtonLoading(registerButton, false);

    showMessage(
        registerMessage,
        "Your form is valid. Connect Supabase to create your account and verify your email.",
        "info"
    );
});


/* ---------- FORGOT PASSWORD ---------- */

forgotPasswordButton.addEventListener("click", () => {

    clearMessage(loginMessage);

    const email = loginEmail.value.trim();

    if (!email || !isValidEmail(email)) {
        showMessage(
            loginMessage,
            "Please enter your registered email address first.",
            "info"
        );

        loginEmail.focus();
        return;
    }

    showMessage(
        loginMessage,
        "Password recovery will work after Supabase is connected.",
        "info"
    );

});


/* ---------- SOCIAL LOGIN BUTTONS ---------- */

document.querySelectorAll(".social-button").forEach((button) => {

    button.addEventListener("click", () => {

        const provider = button.dataset.provider;

        clearMessage(loginMessage);

        const providerNames = {
            google: "Google",
            apple: "Apple",
            facebook: "Facebook"
        };

        const providerName =
            providerNames[provider] || "Social Login";

        showMessage(
            loginMessage,
            `${providerName} sign-in requires authentication provider setup.`,
            "info"
        );

    });

});


/* ---------- BUTTON CLICK FEEDBACK ---------- */

document.querySelectorAll("button").forEach((button) => {

    button.addEventListener("pointerdown", () => {
        if (button.disabled) return;

        button.style.webkitTapHighlightColor = "transparent";
    });

});


/* ---------- INITIAL STATE ---------- */

document.addEventListener("DOMContentLoaded", () => {

    loginPanel.classList.add("active");
    registerPanel.classList.remove("active");

    console.log(
        "GOPI ONLINE CENTRE: Login UI initialized successfully."
    );

});
// ========================================
// LOGIN PAGE <-> REGISTER PAGE NAVIGATION
// ========================================

document.addEventListener("DOMContentLoaded", function () {

    // Login page theke Register page
    const showRegisterButton = document.getElementById("showRegister");

    if (showRegisterButton) {
        showRegisterButton.addEventListener("click", function () {
            window.location.href = "./register.html";
        });
    }

    // Register page theke Login page
    const showLoginButton = document.getElementById("showLogin");

    if (showLoginButton) {
        showLoginButton.addEventListener("click", function () {
            window.location.href = "./index.html";
        });
    }

});