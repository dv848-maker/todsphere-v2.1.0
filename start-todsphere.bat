@echo off
rem TODSphere launcher for Windows.
rem Starts the local server (Node.js 18+) and opens the app in a chromeless Edge window.
rem Without Node.js it opens index.html directly (PDF reports then fall back to an ASCII font).
rem Options (environment variables): PORT (default 8080), TODSPHERE_NO_BROWSER=1 (server only).
setlocal
cd /d "%~dp0"
if "%PORT%"=="" set "PORT=8080"
set "URL=http://127.0.0.1:%PORT%/"

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js was not found. Opening index.html directly.
  start "" "%~dp0index.html"
  exit /b 0
)

if "%TODSPHERE_NO_BROWSER%"=="1" (
  node server\server.js
  exit /b %errorlevel%
)

start "TODSphere server - close this window to stop" /min node server\server.js
timeout /t 2 /nobreak >nul
start "" msedge --app=%URL% 2>nul || start "" %URL%
exit /b 0
