# One-Click Rollback Script to restore the previous design
Remove-Item -Recurse -Force src
Copy-Item -Recurse -Force src_pre_glass_backup src
Write-Host "Design restored to pre-glass backup successfully!" -ForegroundColor Green
