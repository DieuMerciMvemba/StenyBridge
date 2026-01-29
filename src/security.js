/**
 * ============================================================
 * Mvemba Research Systems — Steny Bridge
 * Security Module (Scientific Implementation Notes)
 * - API key authentication
 * - Optional HMAC signing for n8n webhook events
 * - Input validation helpers
 * ============================================================
 */

const crypto = require("crypto");

function safeEqual(a, b) {
  const aa = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  if (aa.length !== bb.length) return false;
  return crypto.timingSafeEqual(aa, bb);
}

function requireApiKey(req, res, next) {
  const expected = process.env.BRIDGE_API_KEY || "";
  const got = req.headers["x-api-key"] || "";
  if (!expected || !safeEqual(got, expected)) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  return next();
}

/**
 * HMAC signature for outbound events to n8n:
 * header: x-steny-signature: sha256=<hex>
 */
function signPayload(payload, secret) {
  const h = crypto.createHmac("sha256", secret);
  h.update(JSON.stringify(payload));
  return `sha256=${h.digest("hex")}`;
}

module.exports = {
  requireApiKey,
  signPayload
};
