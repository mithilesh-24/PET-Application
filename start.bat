@echo off
setlocal
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js 20 LTS or newer is required. Download it from https://nodejs.org/
  exit /b 1
)

if not exist "frontend\dist\index.html" (
  echo Building PET Prep frontend bundle...
  call npm run build
  if errorlevel 1 exit /b 1
)

echo Starting PET Prep on http://localhost:4000 ...
call npm run start
