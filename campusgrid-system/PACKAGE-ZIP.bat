@echo off
cd /d "%~dp0\.."
echo Packaging campusgrid-system (excluding node_modules, build, db)...
powershell -NoProfile -Command ^
  "if (Test-Path 'campusgrid-system.zip') { Remove-Item 'campusgrid-system.zip' -Force };" ^
  "$exclude = @('node_modules','android\\android\\**\\build','android\\android\\.gradle','*.db','*.db-wal','*.db-shm','dist');" ^
  "Compress-Archive -Path 'campusgrid-system\*' -DestinationPath 'campusgrid-system.zip' -Force"
echo.
echo Created: %cd%\campusgrid-system.zip
echo Note: If the zip is huge, delete campusgrid-system\clients\android\node_modules and re-run.
pause
