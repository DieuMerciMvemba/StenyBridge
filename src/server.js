/**
 * ============================================================
 * Mvemba Research Systems — Steny Bridge
 * Secure HTTP Gateway + n8n Bridge
 * Scientific-grade operational constraints:
 * - Minimal public surface area
 * - API key authentication for outbound send requests
 * - Rate limiting
 * - Optional HMAC signature to n8n
 * - Strict input validation (Zod)
 * ============================================================
 */

const express = require("express");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const axios = require("axios");
const pino = require("pino-http");
const { z } = require("zod");

const { startWhatsApp } = require("./whatsapp");
const { requireApiKey, signPayload } = require("./security");

const app = express();
app.disable("x-powered-by");
app.use(helmet());
app.use(express.json({ limit: "256kb" }));
app.use(pino());

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

app.get("/health", (req, res) => {
  res.json({ ok: true, whatsappReady: Boolean(sock) });
});

const SendSchema = z.object({
  to: z.string().min(10).max(40),
  text: z.string().min(1).max(3000)
});

app.post("/v1/send", requireApiKey, async (req, res) => {
  try {
    if (!sock) return res.status(503).json({ error: "WhatsApp not ready" });

    const parsed = SendSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Invalid payload" });

    const { to, text } = parsed.data;

    if (ALLOWED_TO_PREFIX) {
      // Basic safety: allow only JIDs matching your expected prefix
      // Example: 243xxxx@s.whatsapp.net
      if (!to.startsWith(ALLOWED_TO_PREFIX) && !to.startsWith(`${ALLOWED_TO_PREFIX}`)) {
        return res.status(403).json({ error: "Recipient not allowed" });
      }
    }

    await sock.sendMessage(to, { text });
    return res.json({ sent: true });
  } catch (e) {
    return res.status(500).json({ error: "Send failed" });
  }
});

async function postToN8n(event) {
  if (!N8N_WEBHOOK_INBOUND) return;

  const headers = {};
  if (N8N_HMAC_SECRET) {
    headers["x-steny-signature"] = signPayload(event, N8N_HMAC_SECRET);
  }

  await axios.post(N8N_WEBHOOK_INBOUND, event, { headers, timeout: 15000 });
}

async function main() {
  sock = await startWhatsApp({
    onIncomingText: async ({ from, text }) => {
      // Conservative policy: only handle inbound user messages.
      const event = { from, text, timestamp: Date.now() };

      try {
        await postToN8n(event);
      } catch (e) {
        // Do not leak secrets or stack traces
      }
    }
  });

  app.listen(PORT, () => {
    // No console secrets; logs only operational signals
    console.log(`Steny Bridge listening on port ${PORT}`);
  });
}

main().catch(() => {
  process.exit(1);
});
