# Острова Лабеан — образ для хостинга (Railway, Fly.io, Render, любой VPS с Docker).
FROM node:22-alpine
WORKDIR /app
COPY package.json ./
COPY shared ./shared
COPY server ./server
COPY client ./client
COPY play.html ./play.html
ENV NODE_ENV=production \
    PORT=8080 \
    DATA_DIR=/data/rooms
# Партии хранятся здесь — подключите к этой папке постоянный диск (volume), иначе они пропадут при перезапуске.
VOLUME ["/data"]
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=3s CMD wget -qO- http://127.0.0.1:${PORT}/api/health || exit 1
CMD ["node", "server/server.js"]
