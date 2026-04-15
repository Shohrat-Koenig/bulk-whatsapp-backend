FROM node:20-slim

# Install Chromium and all required system libraries for Puppeteer
RUN apt-get update && apt-get install -y \
    chromium \
    fonts-liberation \
    libappindicator3-1 \
    libasound2 \
    libatk-bridge2.0-0 \
    libatk1.0-0 \
    libcups2 \
    libdbus-1-3 \
    libdrm2 \
    libgbm1 \
    libgtk-3-0 \
    libnspr4 \
    libnss3 \
    libx11-xcb1 \
    libxcomposite1 \
    libxdamage1 \
    libxrandr2 \
    xdg-utils \
    --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

# Tell Puppeteer to use the installed Chromium
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

WORKDIR /app

# Copy package files and install dependencies
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm install typescript

# Copy source and build
COPY tsconfig.json ./
COPY src ./src
RUN npx tsc

# Remove typescript after build
RUN npm remove typescript

# Create directory for WhatsApp session persistence
# Note: we run as root because Railway-mounted volumes are owned by root,
# and the non-root `node` user would hit EACCES when writing to /app/.wwebjs_auth.
# Chromium is launched with --no-sandbox anyway, so this is acceptable for an internal tool.
RUN mkdir -p .wwebjs_auth

EXPOSE 3001

ENV PORT=3001
ENV NODE_ENV=production

CMD ["node", "dist/index.js"]
