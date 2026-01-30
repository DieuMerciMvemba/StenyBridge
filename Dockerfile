# ============================================================
# Mvemba Research Systems — Steny Bridge
# Scientific-grade WhatsApp Web Automation Bridge (Baileys)
# Deployment Target: Hugging Face Docker Space
# ============================================================

FROM node:20-slim

WORKDIR /app

# Copy package definition
COPY package.json ./

# Install dependencies (no package-lock required)
RUN npm install --omit=dev

# Copy source code
COPY . .

# Prepare persistent auth directory (HF mounts /data at runtime)
# Do not fail build if /data is not writable at build time
RUN mkdir -p /data/steny-bridge/auth && chown -R node:node /data || true

# Run as non-root user already provided by the image
USER node

ENV PORT=7860
EXPOSE 7860

CMD ["node", "src/server.js"]
