"use strict";

/**
 * ============================================================
 * Mvemba Research Systems — Steny Bridge
 * Security Module (Scientific Implementation Notes)
 * - API key authentication for outbound send requests
 * - Optional HMAC signing for inbound events to n8n
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
  const got = req.headers["x-api-key"] || req.headers["X-API-Key"] || "";

  if (!expected || !safeEqual(got, expected)) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  return next();
}

/**
 * HMAC signature for events sent to n8n
 * Header: x-steny-signature: sha256=<hex>
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
