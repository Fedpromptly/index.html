// Token Town checkout — PayPal CardFields component (current API)
// SPLIT MODE: frontend on GitHub Pages, backend on Cloudflare Worker.
// Set BACKEND_URL to the Worker's custom domain (never the workers.dev URL).
const BACKEND_URL = "https://shop-api.fedpromptly.com"; // <-- HIS DOMAIN HERE

function resultMessage(m){ document.querySelector("#result-message").innerHTML = m; }

async function api(path, opts) {
  const res = await fetch(BACKEND_URL + path, opts);
  return res.json();
}

async function createOrderCallback(){
  resultMessage("");
  const productId = document.getElementById("product").value;
  const orderData = await api("/api/orders", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ product_id: productId }),
  });
  if (orderData.id) return orderData.id;
  throw new Error(orderData?.details?.[0]?.description || JSON.stringify(orderData));
}

async function onApproveCallback(data){
  const orderData = await api("/api/orders/" + data.orderID + "/capture", { method: "POST" });
  const capture = orderData?.purchase_units?.[0]?.payments?.captures?.[0];
  const err = orderData?.details?.[0];
  if (err || !capture || capture.status === "DECLINED") {
    throw new Error(err ? err.description : "Transaction " + (capture && capture.status));
  }
  resultMessage("Payment " + capture.status + " — ID " + capture.id +
    "<br><br>You're in. Watch your email for the welcome message.");
}

function onErrorCallback(err){
  resultMessage("Checkout error: " + (err?.message || JSON.stringify(err)));
}

function renderCheckout() {
  window.paypal.Buttons({
    createOrder: createOrderCallback,
    onApprove: (data) => onApproveCallback(data).catch(e => resultMessage("Could not complete payment: " + e.message)),
    onError: onErrorCallback,
    style: { shape: "rect", layout: "vertical", color: "gold", label: "paypal" },
  }).render("#paypal-button-container");

  const cardField = window.paypal.CardFields({
    createOrder: createOrderCallback,
    onApprove: (data) => onApproveCallback(data).catch(e => resultMessage("Could not complete payment: " + e.message)),
    onError: onErrorCallback,
    style: {
      input: { "font-size": "16px", "font-family": "courier, monospace", "font-weight": "lighter", color: "#ccc" },
      ".invalid": { color: "purple" },
    },
  });

  if (cardField.isEligible()) {
    cardField.NameField({ style: { input: { color: "blue" }, ".invalid": { color: "purple" } } }).render("#card-name-field-container");
    cardField.NumberField({ style: { input: { color: "blue" } } }).render("#card-number-field-container");
    cardField.ExpiryField({ style: { input: { color: "blue" } } }).render("#card-expiry-field-container");
    cardField.CVVField({ style: { input: { color: "blue" } } }).render("#card-cvv-field-container");

    document.getElementById("card-field-submit-button").addEventListener("click", () => {
      cardField.submit({
        billingAddress: {
          addressLine1: document.getElementById("card-billing-address-line-1").value,
          addressLine2: document.getElementById("card-billing-address-line-2").value,
          adminArea1: document.getElementById("card-billing-address-city").value,
          adminArea2: document.getElementById("card-billing-address-state").value,
          postalCode: document.getElementById("card-billing-address-postal-code").value,
          countryCode: "US",
        },
      }).catch(onErrorCallback);
    });
  } else {
    document.getElementById("card-form").style.display = "none";
    resultMessage("Card payments aren't available right now — please use the PayPal button above.");
  }
}

// Boot: fetch client token from the Worker backend, load PayPal SDK, render.
(async function boot() {
  try {
    const cfg = await api("/api/client-token");
    const sdkBase = cfg.mode === "live" ? "https://www.paypal.com" : "https://www.sandbox.paypal.com";
    const s = document.createElement("script");
    s.src = sdkBase + "/sdk/js?client-id=" + encodeURIComponent(cfg.clientId) +
      "&currency=USD&components=buttons,card-fields&enable-funding=venmo" +
      (cfg.mode === "sandbox" ? "&buyer-country=US" : "");
    s.setAttribute("data-client-token", cfg.clientToken);
    s.onload = renderCheckout;
    s.onerror = () => resultMessage("Could not load PayPal checkout. Check your connection and refresh.");
    document.head.appendChild(s);
  } catch (e) {
    resultMessage("Checkout backend unreachable (" + BACKEND_URL + "). The API Worker must be deployed first.");
  }
})();
