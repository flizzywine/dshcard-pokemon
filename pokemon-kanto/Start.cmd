@echo off
cd /d "%~dp0"
start "Pokemon Kanto Server" /min node server.cjs
timeout /t 2 /nobreak >nul
start "" http://127.0.0.1:4177
