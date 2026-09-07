@echo off
chcp 65001 >nul
title GoT - Go AI Workbench
cd /d "%~dp0"
node server.js --open
if errorlevel 9009 echo [GoT] Node.js not found. Install: https://nodejs.org/
pause