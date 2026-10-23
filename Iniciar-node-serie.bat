@echo off
setlocal
cd /d "%~dp0"

:: Verificar Node.js
where node >nul 2>&1
if errorlevel 1 (
  echo No se encontro Node.js. Instalalo y volve a ejecutar este archivo.
  pause
  exit /b 1
)

:: Verificar Python
where python >nul 2>&1
if errorlevel 1 (
  echo No se encontro Python. Asegurate de instalarlo si usaras el lector serial.
  echo.
) else (
  echo Iniciando el receptor de Python para el ESP32...
  start "Receptor Python Cajero" python receptor_cajero.py
)

echo Iniciando el servicio local del cajero (Node.js)...
npm start

if errorlevel 1 (
  echo.
  echo El servicio no pudo iniciarse. Si aparece EADDRINUSE, ya hay otra instancia activa.
  pause
)