# Ship: commit the tested work and push it to GitHub (main deploys to GitHub Pages).
# Run it from Ship.exe in the repo root, or: powershell -ExecutionPolicy Bypass -File scripts\ship.ps1
# Steps: show the changes, typecheck and run the tests, commit with the version and changelog notes, push.
# On a work branch it pushes the branch, then fast-forwards main to it and pushes main (project rule).
# It never stages trial/ (owner game data), .agents/, .handover/ or AGENTS.md.

$ErrorActionPreference = 'Continue'
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

function Stop-Ship([string]$why) {
  Write-Host ''
  Write-Host "Stopped: $why" -ForegroundColor Red
  Write-Host 'Nothing was pushed.' -ForegroundColor Red
  exit 1
}
function Ask([string]$q) {
  $a = Read-Host "$q [y/N]"
  return $a -match '^(y|yes)$'
}
function Invoke-Git([string[]]$a) {
  & git.exe @a
  if ($LASTEXITCODE -ne 0) { Stop-Ship "git $($a -join ' ') failed" }
}

Write-Host "Nightcap ship ($root)" -ForegroundColor Cyan
$branch = (& git.exe branch --show-current).Trim()
if (-not $branch) { Stop-Ship 'not on a branch (detached HEAD)' }
Write-Host "Branch: $branch"

# 1. what will go in
$exclude = @(':!trial', ':!.agents', ':!.handover', ':!AGENTS.md')
$changes = & git.exe status --porcelain -- . @exclude
$ahead = 0
& git.exe rev-parse --verify --quiet "origin/$branch" *> $null
if ($LASTEXITCODE -eq 0) { $ahead = [int](& git.exe rev-list --count "origin/$branch..HEAD") }
if (-not $changes -and $ahead -eq 0) { Write-Host 'Nothing to commit or push.' -ForegroundColor Yellow; exit 0 }
if ($changes) {
  Write-Host ''
  Write-Host 'Changes to commit:' -ForegroundColor Cyan
  $changes | ForEach-Object { Write-Host "  $_" }
  # game data must never reach GitHub
  $risky = $changes | Where-Object { $_ -match '(backup|export).*\.json|\.csv$|potato' }
  if ($risky) { Write-Host ''; Write-Host 'These look like game data:' -ForegroundColor Yellow; $risky | ForEach-Object { Write-Host "  $_" -ForegroundColor Yellow }; if (-not (Ask 'Include them anyway?')) { Stop-Ship 'game data in the changes' } }
}

# 2. checks
Write-Host ''
Write-Host 'Typecheck...' -ForegroundColor Cyan
& npx tsc -b
if ($LASTEXITCODE -ne 0) { Stop-Ship 'typecheck failed' }
Write-Host 'Tests...' -ForegroundColor Cyan
& npx vitest run
if ($LASTEXITCODE -ne 0) { Stop-Ship 'tests failed' }

# 3. commit
if ($changes) {
  $pkg = Get-Content package.json -Raw | ConvertFrom-Json
  $version = $pkg.version
  # the first changelog entry's notes become the commit body
  $log = Get-Content src\lib\changelog.ts -Raw
  $notes = @()
  $m = [regex]::Match($log, "version: '([^']+)'[^\[]*\[(.*?)\]\s*\}", 'Singleline')
  if ($m.Success -and $m.Groups[1].Value -eq $version) {
    $notes = [regex]::Matches($m.Groups[2].Value, "'((?:[^'\\]|\\.)*)'") | ForEach-Object { $_.Groups[1].Value -replace "\\'", "'" }
  }
  $title = "v$version"
  Write-Host ''
  $typed = Read-Host "Commit title (Enter for `"$title`")"
  if ($typed.Trim()) { $title = $typed.Trim() }
  $msgFile = Join-Path $env:TEMP 'nightcap-ship-msg.txt'
  $body = if ($notes.Count) { ($notes | ForEach-Object { "- $_" }) -join "`n" } else { '' }
  [IO.File]::WriteAllText($msgFile, "$title`n`n$body`n", (New-Object Text.UTF8Encoding $false))
  Write-Host ''
  Write-Host '--- commit message ---' -ForegroundColor Cyan
  Get-Content $msgFile | ForEach-Object { Write-Host $_ }
  Write-Host '----------------------' -ForegroundColor Cyan
  if (-not (Ask 'Commit these changes?')) { Stop-Ship 'commit not confirmed' }
  # trial/ is already ignored by .gitignore; naming an ignored folder in git add makes git fail, so it is left out here.
  # core.safecrlf=false hides the "LF will be replaced by CRLF" notes (line endings are still converted as before).
  Invoke-Git (@('-c', 'core.safecrlf=false', 'add', '-A', '--', '.') + ($exclude | Where-Object { $_ -ne ':!trial' }))
  Invoke-Git @('commit', '-F', $msgFile)
  Remove-Item $msgFile -ErrorAction SilentlyContinue
}

# 4. push
Write-Host ''
if (-not (Ask "Push $branch$(if ($branch -ne 'main') { ' and fast-forward main' }) to GitHub?")) { Stop-Ship 'push not confirmed (the commit stays on this computer)' }
# GitHub account: Git Credential Manager keeps the last sign-in. Forgetting it makes the push open the GitHub sign-in
# window, where any account (any email) can sign in. That account needs write access to the repo.
$known = & git.exe credential-manager github list 2>$null
if ($known) { Write-Host "Signed in to GitHub as: $($known -join ', ')" }
if (Ask 'Sign in to GitHub as a different account for this push?') {
  foreach ($u in $known) { & git.exe credential-manager github logout $u 2>$null | Out-Null }
  "protocol=https`nhost=github.com`n`n" | & git.exe credential reject
  Write-Host 'Signed out. The GitHub sign-in window opens at the push: sign in with the account you want.' -ForegroundColor Yellow
}
Invoke-Git @('push', '-u', 'origin', $branch)
if ($branch -ne 'main') {
  Invoke-Git @('fetch', 'origin', 'main')
  Invoke-Git @('checkout', 'main')
  & git.exe merge --ff-only $branch
  if ($LASTEXITCODE -ne 0) { & git.exe checkout $branch; Stop-Ship "main cannot fast-forward to $branch (main has commits $branch lacks). $branch is pushed." }
  Invoke-Git @('push', 'origin', 'main')
  Invoke-Git @('checkout', $branch)
}
Write-Host ''
Write-Host "Done: $branch pushed$(if ($branch -ne 'main') { ', main fast-forwarded and pushed' }). GitHub Pages deploys from main." -ForegroundColor Green
