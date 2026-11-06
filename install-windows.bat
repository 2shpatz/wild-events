@echo off
rem Double-click this file to install the site (Windows).
cd /d "%~dp0"
title Event albums - installation
where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo  Node.js is not installed yet.
  echo  A browser will open on nodejs.org - download the "LTS" version, install it
  echo  with the default options, then double-click this file again.
  echo.
  start "" "https://nodejs.org/en/download"
  pause
  exit /b 1
)
call npm install --no-fund --no-audit
if errorlevel 1 (
  echo.
  echo  Installing components failed. Check your internet connection and try again.
  pause
  exit /b 1
)
call npm run setup
echo.
pause
