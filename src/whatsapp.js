"use strict";

/**
 * ============================================================
 * Mvemba Research Systems — Steny Bridge
 * WhatsApp Web Interface Layer (Baileys)
 * Scientific-grade runtime design:
 * - Uses /data when available (HF persistent storage)
 * - Falls back to /tmp when /data is not writable
 * - Text-only MVP processing (extensible)
 * ============================================================
 */

const fs = require("fs");
const path = require("path");
const pino = require("pino");
const qrcode = require("qrcode-terminal");
const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion
} = require("@whiskeysockets/baileys");

function pickWritableAuthDir() {
  const preferredBase = process.env.HF_PERSIST_DIR || "/data";
  const preferred = path.join(preferredBase, "steny-bridge", "auth");

  try {
    fs.mkdirSync(preferred, { recursive: true });
    fs.accessSync(preferred, fs.constants.W_OK);
    return preferred;
  } catch (_) {
    const fallback = path.join("/tmp", "steny-bridge", "auth");
    fs.mkdirSync(fallback, { recursive: true });
    return fallback;
  }
}

async function startWhatsApp({ onIncomingText }) {
  const authDir = pickWritableAuthDir();

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

      if (!text) continue;

      await onIncomingText({ from, text });
    }
  });

  return sock;
}

module.exports = { startWhatsApp };
