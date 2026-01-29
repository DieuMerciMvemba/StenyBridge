# ============================================================
# Mvemba Research Systems — Steny Bridge
# Scientific-grade WhatsApp Web Automation Bridge (Baileys)
# Deployment Target: Hugging Face Docker Space
# ============================================================

FROM node:20-slim

# Security: create a non-root user
RUN useradd -m -u 1000 mvemba && mkdir -p /app && chown -R mvemba:mvemba /app

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

COPY . .

USER mvemba

# Hugging Face expects one externally exposed port (commonly 7860)
ENV PORT=7860
EXPOSE 7860

CMD ["node", "src/server.js"]
