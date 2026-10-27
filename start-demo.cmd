@echo off
rem Starts the API (FastAPI, port 4000) and the website (port 3000), then opens the browser.
cd /d "%~dp0"
if not exist apps\api\.venv\Scripts\python.exe (echo Setting up the Python API first... & call npm run setup:api)
if not exist apps\web\.next (echo Building the website first... & call npm run build)
start "Portfolio & Prime" cmd /k "node start.js"
timeout /t 15 /nobreak >nul
start http://localhost:3000
