@echo off
chcp 65001 > nul
title THE FIRST GROUP - WhatsApp Bot Server
color 0A

echo ===================================================
echo     THE FIRST GROUP (TFG) - WHATSAPP BOT SERVER
echo ===================================================
echo.
echo [1/2] جاري فحص بيئة العمل وتشغيل خادم البوت...
echo.

cd /d "%~dp0"

:loop
echo [%time%] جاري تشغيل سيرفر الواتساب والاتصال بقاعدة البيانات...
node server/whatsapp-bot.js
echo.
echo [تنبيه] تم إيقاف السيرفر، سيتم إعادة التشغيل تلقائياً بعد 5 ثوانٍ...
timeout /t 5
goto loop
