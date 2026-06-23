@echo off
setlocal
title XRPEGGED Compute Worker Installer

set "INSTALLER=%TEMP%\xrpegged-worker-install.ps1"

echo.
echo XRPEGGED Compute Worker
echo ========================
echo This installs the worker and adds a desktop shortcut.
echo Windows may ask whether PowerShell can make changes.
echo.

powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "Invoke-WebRequest -UseBasicParsing -Uri 'https://pegd.org/install.ps1' -OutFile '%INSTALLER%'"
if errorlevel 1 goto download_failed

powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%INSTALLER%"
if errorlevel 1 goto install_failed

del "%INSTALLER%" >nul 2>&1
echo.
echo Installation complete. Open PEGD Worker from your desktop.
echo.
pause
exit /b 0

:download_failed
echo.
echo The installer could not be downloaded from pegd.org.
echo Check your internet connection and try again.
echo.
pause
exit /b 1

:install_failed
echo.
echo Installation did not complete. Read the error above.
echo If Windows Security blocked a miner, review it before allowing it.
echo.
pause
exit /b 1
