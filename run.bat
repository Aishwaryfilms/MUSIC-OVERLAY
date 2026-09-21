@echo off
title TMO — Throttl Music Overlay
cd /d "%~dp0"
if exist "TMO.exe" (
    start "" "TMO.exe"
) else (
    npm start
)
