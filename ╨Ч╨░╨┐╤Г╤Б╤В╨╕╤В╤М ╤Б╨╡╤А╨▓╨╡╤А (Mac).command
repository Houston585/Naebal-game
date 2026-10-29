#!/bin/bash
cd "$(dirname "$0")"
command -v node >/dev/null || { echo "Нужен Node.js 20 или новее: https://nodejs.org"; read; exit 1; }
echo "Острова Лабеан: сервер запускается. Откройте http://localhost:8080"
(sleep 1; open http://localhost:8080) &
node server/server.js
