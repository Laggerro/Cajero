@echo off
setlocal
cd /d "%~dp0"

where node >nul 2>&1
if errorlevel 1 (
  echo No se encontro Node.js. Instalalo y volve a ejecutar este archivo.
  pause
  exit /b 1
)

echo Iniciando el servicio local del cajero...
npm start

if errorlevel 1 (
  echo.
  echo El servicio no pudo iniciarse. Si aparece EADDRINUSE, ya hay otra instancia activa.
  pause
)
