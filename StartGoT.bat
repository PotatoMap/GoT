@echo off
chcp 65001 >nul
title GoT - Go AI Workbench
cd /d "%~dp0"
set "GOT_PORT=4173"
set /a GOT_PORT_TRIES=0
:find_got_port
netstat -ano -p tcp | findstr /R /C:":%GOT_PORT% .*LISTENING" >nul
if errorlevel 1 goto got_port_ready
set /a GOT_PORT+=1
set /a GOT_PORT_TRIES+=1
if %GOT_PORT_TRIES% GEQ 40 goto got_port_failed
goto find_got_port
:got_port_ready
echo [GoT] Starting local server on port %GOT_PORT%...
node server.js --port %GOT_PORT% --open
if errorlevel 9009 echo [GoT] Node.js not found. Install: https://nodejs.org/
pause
exit /b
:got_port_failed
echo [GoT] No free port found between 4173 and 4212.
pause
