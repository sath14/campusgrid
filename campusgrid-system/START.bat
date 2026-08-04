@echo off
setlocal
set "PATH=C:\Program Files\nodejs;%PATH%"
cd /d "%~dp0"

echo === CampusGrid SYSTEM (web app + edge API) ===
if not exist node_modules\express call npm.cmd install
if not exist data mkdir data
if not exist data\faces mkdir data\faces

echo.
echo Starting ONE server on port 3000 ...
echo   App:   http://127.0.0.1:3000
echo   Edge:  http://127.0.0.1:3000/edge
echo.
echo Keep this window open. Then run START-AGENT.bat for RFID+webcam.
echo.
call npm.cmd start
pause
