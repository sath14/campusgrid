@echo off
cd /d "%~dp0"
echo Installing Android shell dependencies...
call npm install
if errorlevel 1 exit /b 1
echo.
echo Adding Android platform (first time only)...
if not exist android (
  call npx cap add android
)
call npx cap sync android
echo.
echo Next: open Android Studio with:
echo   npx cap open android
echo Then Build ^> Build Bundle(s) / APK(s) ^> Build APK(s)
echo See PACKAGING.md for full steps + cleartext HTTP fix.
pause
