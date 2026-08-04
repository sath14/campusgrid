@echo off
setlocal
set "PATH=C:\Program Files\nodejs;%PATH%"
cd /d "%~dp0"

echo.
echo === CampusGrid SYSTEM — INSTALL (app + edge together) ===
echo Folder: %cd%
echo Expected: C:\Users\sath\Downloads\campusgrid-system
echo.

if not exist package.json goto bad
if not exist server\server.js goto bad
if not exist app\login.html goto bad
if not exist edge\agent\edge_agent.py goto bad

echo [1/2] Installing Node packages for the combined server...
call npm.cmd install
if errorlevel 1 (
  echo npm install failed
  pause
  exit /b 1
)
if not exist node_modules\express (
  echo express missing after install
  pause
  exit /b 1
)

echo [2/2] Installing Python packages for Arduino + webcam agent...
python -m pip install -r edge\agent\requirements.txt
if errorlevel 1 (
  py -m pip install -r edge\agent\requirements.txt
)

echo.
echo SUCCESS — one system ready.
echo Next: START.bat   then   START-AGENT.bat
echo Or:   START-ALL.bat
echo.
pause
exit /b 0

:bad
echo ERROR: Wrong folder or incomplete extract.
echo Extract zip to: C:\Users\sath\Downloads\campusgrid-system
pause
exit /b 1
