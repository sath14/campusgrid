@echo off
setlocal
cd /d "%~dp0edge\agent"

echo === CampusGrid RFID + Webcam Agent ===
echo Posts into the SAME server at http://127.0.0.1:3000
echo Make sure START.bat is already running.
echo Close Arduino Serial Monitor first.
echo.

if not exist config.json copy /Y config.example.json config.json >nul
python -m pip install -r requirements.txt >nul 2>&1
python edge_agent.py %*
pause
