"use strict";

/**
 * ============================================================
 * Mvemba Research Systems — Steny Bridge
 * WhatsApp Web Interface Layer (Baileys)
 * - Pairing code support
 * - QR capture for /qr.png endpoint
 * ============================================================
 */

const fs = require("fs");
const path = require("path");
const pino = require("pino");
const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion
} = require("@whiskeysockets/baileys");

let lastQr = null;
let lastPairingCode = null;

function getLastQr() {
  return lastQr;
}

function getLastPairingCode() {
  return lastPairingCode;
}

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

  // If not registered, try pairing-code (recommended for Render logs)
  if (!sock.authState.creds.registered) {
    const phone = String(process.env.WA_PHONE_NUMBER || "").replace(/\D/g, "");
    if (phone) {
      try {
        const code = await sock.requestPairingCode(phone);
        lastPairingCode = code;
        console.log("WhatsApp pairing code:", code);
      } catch (e) {
        console.log("Failed to request pairing code:", e?.message || String(e));
      }
    } else {
      console.log("WA_PHONE_NUMBER missing. Pairing code disabled.");
    }
  }

  sock.ev.on("connection.update", (update) => {
    const { connection, lastDisconnect, qr } = update;

    // Capture QR for /qr.png (some devices prefer scanning)
    if (qr) {
      lastQr = qr;
      console.log("QR updated. Open /qr.png?key=YOUR_BRIDGE_API_KEY to scan.");
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

module.exports = {
  startWhatsApp,
  getLastQr,
  getLastPairingCode
};
