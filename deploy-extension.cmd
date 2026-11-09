@echo off
cd /d "%~dp0"
set "SRC=%~dp0extension\persona-switcher.ts"
set "DST=%USERPROFILE%\.pi\agent\extensions\persona-switcher.ts"
if not exist "%USERPROFILE%\.pi\agent\extensions" mkdir "%USERPROFILE%\.pi\agent\extensions"
if not exist "%SRC%" (
  echo [ERROR] 找不到 %SRC%
  pause
  exit /b 1
)
copy /Y "%SRC%" "%DST%" >nul
if errorlevel 1 (
  echo [ERROR] 复制失败，请检查权限。
  pause
  exit /b 1
)
echo 已部署扩展:
echo   %DST%
echo.
echo 需要重启 pi-web / Pi CLI 才会加载扩展。
echo 面板启动: start-persona-panel.cmd
pause
