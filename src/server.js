/**
 * ============================================================
 * Mvemba Research Systems — Steny Bridge
 * Secure HTTP Gateway + n8n Bridge
 * Scientific-grade operational constraints:
 * - Minimal public surface area
 * - API key auth for outbound send requests
 * - Rate limiting
 * - HMAC signature to n8n (optional but recommended)
 * - Strict input validation (Zod)
 * - Runtime diagnostics endpoint (/diag) for network validation
 * ============================================================
 */

const express = require("express");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const axios = require("axios");
const pinoHttp = require("pino-http");
const { z } = require("zod");

// Diagnostics
const dns = require("dns").promises;
const https = require("https");

const { startWhatsApp } = require("./whatsapp");
const { requireApiKey, signPayload } = require("./security");

const app = express();
app.disable("x-powered-by");
app.use(helmet());
app.use(express.json({ limit: "256kb" }));
app.use(pinoHttp());

const limiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false
});
app.use(limiter);

const PORT = Number(process.env.PORT || 7860);
const N8N_WEBHOOK_INBOUND = process.env.N8N_WEBHOOK_INBOUND || "";
const N8N_HMAC_SECRET = process.env.N8N_HMAC_SECRET || "";
const ALLOWED_TO_PREFIX = process.env.ALLOWED_TO_PREFIX || "";

let sock = null;

/**
 * Root endpoint (prevents HF "connection not allowed" confusion)
 */
app.get("/", (req, res) => {
  res.status(200).send("Steny Bridge is running.");
});

app.get("/health", (req, res) => {
  res.json({ ok: true, whatsappReady: Boolean(sock) });
});

/**
 * Diagnostics endpoint
 * Use it to confirm if the container can resolve and reach WhatsApp Web.
 * - DNS check for web.whatsapp.com
 * - HTTPS check to a neutral endpoint (google.com)
 */
app.get("/diag", async (req, res) => {
  const out = {};

  try {
    out.dns_web_whatsapp = await dns.lookup("web.whatsapp.com");
  } catch (e) {
    out.dns_web_whatsapp_error = e.message;
  }

  out.https_google = await new Promise((resolve) => {
    const r = https.get("https://www.google.com", (resp) => {
      resolve({ status: resp.statusCode });
      resp.resume();
    });

    r.on("error", (e) => resolve({ error: e.message }));
    r.setTimeout(8000, () => {
      r.destroy(new Error("timeout"));
    });
  });

  res.json(out);
});

const SendSchema = z.object({
  to: z.string().min(10).max(60),
  text: z.string().min(1).max(3000)
});

app.post("/v1/send", requireApiKey, async (req, res) => {
  try {
    if (!sock) return res.status(503).json({ error: "WhatsApp not ready" });

    const parse
