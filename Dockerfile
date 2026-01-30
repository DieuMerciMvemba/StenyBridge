# ============================================================
# Mvemba Research Systems — Steny Bridge
# Scientific-grade WhatsApp Web Automation Bridge (Baileys)
# Deployment Target: Hugging Face Docker Space
# ============================================================

FROM node:20-slim

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

COPY . .

# Hugging Face Persistent Storage usually mounts at /data (runtime).
# Create app-owned data directories safely.
RUN mkdir -p /data/steny-bridge/auth && chown -R node:node /data || true

USER node

ENV PORT=7860
EXPOSE 7860

CMD ["node", "src/server.js"]
