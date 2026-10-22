/* Configure these values before enabling live payments. Never put the Razorpay Secret Key here. */
window.GOPI_RAZORPAY_CONFIG = {
  keyId: "YOUR_RAZORPAY_KEY_ID",
  createOrderUrl: "/api/create-razorpay-order",
  verifyPaymentUrl: "/api/verify-razorpay-payment"
};
