# ============================================================
# Mvemba Research Systems — Steny Bridge
# Scientific-grade WhatsApp Web Automation Bridge (Baileys)
# Deployment Target: Hugging Face Docker Space
# ============================================================

FROM node:20-slim

# Some npm packages may require git during installation (slim images don't include it).
RUN apt-get update && apt-get install -y --no-install-recommends \
    git \
    ca-certificates \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json ./
RUN npm install --omit=dev

COPY . .

USER node

ENV PORT=7860
EXPOSE 7860

CMD ["node", "src/server.js"]
