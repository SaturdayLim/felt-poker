@echo off
rem Builds Ship.exe in the repo root from scripts\ship-launcher.cs. Ship.exe is not committed (.gitignore).
"%WINDIR%\Microsoft.NET\Framework64\v4.0.30319\csc.exe" /nologo /target:exe /out:"%~dp0..\Ship.exe" "%~dp0ship-launcher.cs"
