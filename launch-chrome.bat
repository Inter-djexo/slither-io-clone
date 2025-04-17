@echo off
start chrome --disable-web-security --user-data-dir="%TEMP%\chrome_dev_profile" http://localhost:5000 