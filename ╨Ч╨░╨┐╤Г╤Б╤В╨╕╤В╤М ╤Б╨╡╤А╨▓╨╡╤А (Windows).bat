@echo off
chcp 65001 >nul
cd /d "%~dp0"
where node >nul 2>nul || (echo Нужен Node.js 20 или новее: https://nodejs.org & pause & exit /b)
echo Острова Лабеан: сервер запускается. Откройте в браузере http://localhost:8080
echo Чтобы остановить — закройте это окно.
start "" http://localhost:8080
node server/server.js
pause
