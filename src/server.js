"use strict";

/**
 * ============================================================
 * Mvemba Research Systems — Steny Bridge
 * Secure HTTP Gateway + n8n Bridge
 * - /qr.png (protected) to scan QR as an image
 * - /pairing-code (protected) to read the current pairing code
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

// QR image generator
const QRCode = require("qrcode");

const { startWhatsApp, getLastQr, getLastPairingCode } = require("./whatsapp");
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

app.get("/", (req, res) => {
  res.status(200).send("Steny Bridge is running.");
});

app.get("/health", (req, res) => {
  res.json({ ok: true, whatsappReady: Boolean(sock) });
});

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
    r.setTimeout(8000, () => r.destroy(new Error("timeout")));
  });

  res.json(out);
});

/**
 * Protected: get current pairing code (if available)
 * Usage: https://YOUR_DOMAIN/pairing-code?key=BRIDGE_API_KEY
 */
app.get("/pairing-code", requireApiKey, (req, res) => {
  const code = getLastPairingCode();
  if (!code) return res.status(404).json({ error: "Pairing code not available" });
  res.json({ pairingCode: code });
});

/**
 * Protected: QR as PNG
 * Usage: https://YOUR_DOMAIN/qr.png?key=BRIDGE_API_KEY
 */
app.get("/qr.png", requireApiKey, async (req, res) => {
  const qr = getLastQr();
  if (!qr) return res.status(404).send("QR not available");

  try {
    const png = await QRCode.toBuffer(qr, { type: "png", scale: 8, margin: 2 });
    res.setHeader("Content-Type", "image/png");
    res.status(200).send(png);
  } catch (_) {
    res.status(500).send("Failed to generate QR");
  }
});

const SendSchema = z.object({
  to: z.string().min(10).max(60),
  text: z.string().min(1).max(3000)
});

app.post("/v1/send", requireApiKey, async (req, res) => {
  try {
    if (!sock) return res.status(503).json({ error: "WhatsApp not ready" });

    const parsed = SendSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Invalid payload" });

    const { to, text } = parsed.data;

    if (ALLOWED_TO_PREFIX) {
      if (!to.startsWith(ALLOWED_TO_PREFIX)) {
        return res.status(403).json({ error: "Recipient not allowed" });
      }
    }

    await sock.sendMessage(to, { text });
    return res.json({ sent: true });
  } catch (_) {
    return res.status(500).json({ error: "Send failed" });
  }
});

async function postToN8n(event) {
  if (!N8N_WEBHOOK_INBOUND) return;

  const headers = {};
  if (N8N_HMAC_SECRET) {
    headers["x-steny-signature"] = signPayload(event, N8N_HMAC_SECRET);
  }

  await axios.post(N8N_WEBHOOK_INBOUND, event, {
    headers,
    timeout: 15000
  });
}

async function main() {
  console.log("Steny Bridge booting...");

  sock = await startWhatsApp({
    onIncomingText: async ({ from, text }) => {
      const event = { from, text, timestamp: Date.now() };
      try {
        await postToN8n(event);
      } catch (_) {}
    }
  });

  app.listen(PORT, () => {
    console.log(`Steny Bridge listening on port ${PORT}`);
  });
}

main().catch(() => process.exit(1));
