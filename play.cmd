@echo off
cd /d "%~dp0"
start "Pingpong Server" /min cmd /c "node serve.mjs"
timeout /t 1 /nobreak >nul
start "" "http://127.0.0.1:4173/"
