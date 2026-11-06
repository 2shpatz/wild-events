#!/bin/bash
# Double-click this file to install the site (Mac).
# First time macOS may block it: right-click the file > Open > Open.
cd "$(dirname "$0")" || exit 1
if ! command -v node >/dev/null 2>&1; then
  echo
  echo " Node.js is not installed yet."
  echo " A browser will open on nodejs.org - download the \"LTS\" version (macOS Installer),"
  echo " install it, then double-click this file again."
  echo
  open "https://nodejs.org/en/download"
  read -r -p " Press Enter to close..."
  exit 1
fi
npm install --no-fund --no-audit || { echo; echo " Installing components failed. Check your internet connection and try again."; read -r -p " Press Enter to close..."; exit 1; }
npm run setup
echo
read -r -p " Press Enter to close..."
