"use strict";

import { supabase } from "./supabase.js";

// ==========================================
// REGISTRATION ELEMENTS
// ==========================================

const form = document.getElementById("createAccountForm");

const fullName = document.getElementById("fullName");
const email = document.getElementById("email");
const mobile = document.getElementById("mobile");

const password = document.getElementById("password");
const confirmPassword = document.getElementById("confirmPassword");

const acceptTerms = document.getElementById("acceptTerms");

const submitButton = document.getElementById("createAccountButton");
const message = document.getElementById("createAccountMessage");

// OTP Elements
const otpPanel = document.getElementById("otpVerificationPanel");
const otpForm = document.getElementById("otpVerificationForm");
const otpInput = document.getElementById("emailOtp");
const verifyButton = document.getElementById("verifyOtpButton");
const otpMessage = document.getElementById("otpMessage");

// ==========================================
// MESSAGE FUNCTION
// ==========================================

function showMessage(element, text, type = "info") {
    if (!element) return;

    element.textContent = text;
    element.className = `form-message ${type}`;
}

// ==========================================
// BUTTON LOADING
// ==========================================

function setButtonLoading(button, loading, text) {
    if (!button) return;

    button.disabled = loading;

    const textElement = button.querySelector(".button-text");

    if (textElement) {
        if (loading) {
            textElement.dataset.originalText = textElement.textContent;
            textElement.textContent = text;
        } else {
            textElement.textContent =
                textElement.dataset.originalText || text;
        }
    }
}

// ==========================================
// PASSWORD SHOW / HIDE
// ==========================================

function togglePassword(input, button) {
    if (!input || !button) return;

    button.addEventListener("click", () => {
        const show = input.type === "password";

        input.type = show ? "text" : "password";

        const icon = button.querySelector("i");

        if (icon) {
            icon.classList.toggle("fa-eye", show);
            icon.classList.toggle("fa-eye-slash", !show);
        }

        button.setAttribute(
            "aria-label",
            show ? "Hide password" : "Show password"
        );

        button.setAttribute("aria-pressed", String(show));
    });
}

togglePassword(
    password,
    document.getElementById("showPassword")
);

togglePassword(
    confirmPassword,
    document.getElementById("showConfirmPassword")
);

// ==========================================
// MOBILE NUMBER VALIDATION
// ==========================================

if (mobile) {
    mobile.addEventListener("input", () => {
        mobile.value = mobile.value
            .replace(/\D/g, "")
            .slice(0, 10);
    });
}

// ==========================================
// CLEAR OLD MESSAGES
// ==========================================

if (form) {
    form.querySelectorAll("input").forEach((input) => {
        input.addEventListener("input", () => {
            showMessage(message, "");
        });
    });
}

if (otpInput) {
    otpInput.addEventListener("input", () => {
        otpInput.value = otpInput.value
            .replace(/\D/g, "")
            .slice(0, 6);

        showMessage(otpMessage, "");
    });
}

// ==========================================
// CREATE ACCOUNT + SEND EMAIL OTP
// ==========================================

if (form) {
    form.addEventListener("submit", async (event) => {
        event.preventDefault();

        const nameValue = fullName.value.trim();
        const emailValue = email.value.trim().toLowerCase();
        const mobileValue = mobile.value.trim();

        if (nameValue.length < 2) {
            showMessage(message, "Please enter your full name.", "error");
            fullName.focus();
            return;
        }

        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailValue)) {
            showMessage(message, "Please enter a valid email address.", "error");
            email.focus();
            return;
        }

        if (!/^[6-9]\d{9}$/.test(mobileValue)) {
            showMessage(
                message,
                "Please enter a valid 10-digit Indian mobile number.",
                "error"
            );

            mobile.focus();
            return;
        }

        if (password.value.length < 8) {
            showMessage(
                message,
                "Password must contain at least 8 characters.",
                "error"
            );

            password.focus();
            return;
        }

        if (password.value !== confirmPassword.value) {
            showMessage(
                message,
                "Passwords do not match. Please try again.",
                "error"
            );

            confirmPassword.focus();
            return;
        }

        if (!acceptTerms.checked) {
            showMessage(
                message,
                "Please accept the Terms of Service and Privacy Policy.",
                "error"
            );

            acceptTerms.focus();
            return;
        }

        setButtonLoading(submitButton, true, "Sending OTP...");
        showMessage(message, "Connecting securely...", "info");

        try {
            const { data, error } = await supabase.auth.signUp({
                email: emailValue,
                password: password.value,

                options: {
                    data: {
                        full_name: nameValue,
                        phone: mobileValue
                    }
                }
            });

            if (error) {
                throw error;
            }

            // Show OTP panel only after Supabase accepts signup.
            if (otpPanel) {
                otpPanel.hidden = false;
            }

            form.hidden = true;

            if (otpPanel) {
                otpPanel.scrollIntoView({
                    behavior: "smooth",
                    block: "center"
                });
            }

            if (otpInput) {
                otpInput.focus();
            }

            showMessage(
                otpMessage,
                `If a verification email was sent to ${emailValue}, enter its 6-digit code here.`,
                "info"
            );

        } catch (error) {
            console.error("Registration error:", error);

            showMessage(
                message,
                error.message || "Account creation failed. Please try again.",
                "error"
            );

        } finally {
            setButtonLoading(submitButton, false, "Create Account");
        }
    });
}

// ==========================================
// VERIFY EMAIL OTP
// ==========================================

if (otpForm) {
    otpForm.addEventListener("submit", async (event) => {
        event.preventDefault();

        const emailValue = email.value.trim().toLowerCase();
        const token = otpInput.value.trim();

        if (!/^\d{6}$/.test(token)) {
            showMessage(
                otpMessage,
                "Please enter the 6-digit verification code.",
                "error"
            );

            otpInput.focus();
            return;
        }

        setButtonLoading(verifyButton, true, "Verifying...");
        showMessage(otpMessage, "Verifying your email...", "info");

        try {
            const { error } = await supabase.auth.verifyOtp({
                email: emailValue,
                token: token,
                type: "signup"
            });

            if (error) {
                throw error;
            }

            showMessage(
                otpMessage,
                "Email verified successfully! Redirecting to Login...",
                "success"
            );

            setTimeout(() => {
                window.location.href = "index.html?verified=1";
            }, 1500);

        } catch (error) {
            console.error("OTP verification error:", error);

            showMessage(
                otpMessage,
                error.message ||
                    "Verification failed. Check the code and try again.",
                "error"
            );

        } finally {
            setButtonLoading(verifyButton, false, "Verify Email");
        }
    });
}