@echo off
rem Starts the API (port 4000) and the website (port 3000) in two windows, then opens the browser.
cd /d "%~dp0"
if not exist apps\api\dist\main.js (echo Building first... & call npm run build)
start "Portfolio & Prime API" cmd /k "cd /d %~dp0apps\api && node dist\main.js"
timeout /t 6 /nobreak >nul
start "Portfolio & Prime website" cmd /k "cd /d %~dp0apps\web && npx next start -p 3000"
timeout /t 6 /nobreak >nul
start http://localhost:3000
