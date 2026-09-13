@echo off
setlocal
cd /d "%~dp0"
title Reader Studio
set "PS_EXE=%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe"

if not exist "%PS_EXE%" goto no_powershell

"%PS_EXE%" -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0server.ps1"
if errorlevel 1 goto start_error
exit /b 0

:no_powershell
echo Windows PowerShell was not found.
echo Please take a screenshot of this window and send it for support.
pause
exit /b 1

:start_error
echo.
echo Reader Studio could not start.
echo Please take a screenshot of this window and send it for support.
pause
exit /b 1
