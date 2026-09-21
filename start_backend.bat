@echo off
title Clinic Management System - Backend Server
echo ========================================================
echo   Starting Clinic Management System Backend (FastAPI + MongoDB)
echo ========================================================
echo.

cd /d "%~dp0backend"

if not exist ".venv\Scripts\python.exe" (
    echo [ERROR] Virtual environment not found in backend\.venv
    echo Please create it or install dependencies first.
    pause
    exit /b 1
)

echo Activating virtual environment...
call .venv\Scripts\activate.bat

echo Checking MongoDB connection and initializing...
python -c "import mongo; res = mongo.check_connection(); print('[INFO] MongoDB Status:', res)"

echo.
echo Starting FastAPI server on http://127.0.0.1:8000 ...
echo Press Ctrl+C to stop the server.
echo.

python -m uvicorn main:app --reload --host 127.0.0.1 --port 8000

pause
