/**
 * ============================================================
 * Mvemba Research Systems — Steny Bridge
 * WhatsApp Web Interface Layer (Baileys)
 * Scientific-grade runtime design:
 * - Auth state persisted under /data when available
 * - Runtime directory creation to avoid build-time /data issues
 * - Text-only MVP processing (extensible)
 * ============================================================
 */

const fs = require("fs");
const pino = require("pino");
const qrcode = require("qrcode-terminal");
const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion
} = require("@whiskeysockets/baileys");

function getAuthDir() {
  // Hugging Face Persistent Storage mounts at /data (runtime)
  const base = process.env.HF_PERSIST_DIR || "/data";
  return `${base}/steny-bridge/auth`;
}

async function startWhatsApp({ onIncomingText }) {
  const authDir = getAuthDir();

  // Ensure directory exists at runtime
  fs.mkdirSync(authDir, { recursive: true });

  const { state, saveCreds } = await useMultiFileAuthState(authDir);
  const { version } = await fetchLatestBaileysVersion();

  const sock = makeWASocket({
    version,
    logger: pino({ level: process.env.LOG_LEVEL || "info" }),
    auth: state,
    printQRInTerminal: false
  });

  sock.ev.on("creds.update", saveCreds);

  sock.ev.on("connection.update", (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      // QR is shown in Space logs; scan with the WhatsApp mobile app
      qrcode.generate(qr, { small: true });
    }

    if (connection === "close") {
      const statusCode = lastDisconnect?.error?.output?.statusCode;
      const shouldReconnect = statusCode !== DisconnectReason.loggedOut;

      if (shouldReconnect) {
        startWhatsApp({ onIncomingText }).catch(() => {});
      }
    }
  });

  sock.ev.on("messages.upsert", async ({ messages, type }) => {
    if (type !== "notify") return;

    for (const msg of messages) {
      if (!msg.message || msg.key.fromMe) continue;

      const from = msg.key.remoteJid;
      const text =
        msg.message.conversation ||
        msg.message.extendedTextMessage?.text ||
        "";

      // MVP: only text
      if (!text) continue;

      await onIncomingText({ from, text });
    }
  });

  return sock;
}

module.exports = { startWhatsApp };
