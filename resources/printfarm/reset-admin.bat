@echo off
title Reset Admin0 Password
echo.
echo  ========================================
echo   LUGOWARE PrintFarm - Admin0 Password Reset
echo  ========================================
echo.
echo  This will reset the admin0 password.
echo  After reset, login with any password
echo  and you will be asked to set a new one.
echo.
pause

"%~dp0node\node.exe" -e "const{getDb}=require('./server/src/db/sqlite-init');const db=getDb();const r=db.prepare(\"UPDATE users SET status='password_reset' WHERE role='admin0'\").run();if(r.changes>0){console.log('Admin0 password has been reset. Please login to set a new password.')}else{console.log('No admin0 account found.')}"

echo.
pause
