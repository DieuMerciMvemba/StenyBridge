"use strict";

/**
 * ============================================================
 * Mvemba Research Systems — Steny Bridge
 * Security Module
 * - API key authentication (header or query string)
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

  const gotHeader =
    req.headers["x-api-key"] ||
    req.headers["X-API-Key"] ||
    req.headers["x-api-key".toLowerCase()];

  const gotQuery = req.query?.key;

  const got = gotHeader || gotQuery || "";

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
