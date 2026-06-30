@echo off
cd /d "%~dp0"
npx tsx src/server.ts > run.log 2> run.err
