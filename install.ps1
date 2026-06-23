# PEGD Compute Worker — Windows Installer
# Run with: irm https://pegd.org/install.ps1 | iex

$WorkerUrl  = "https://pegd.org/worker.py"
$InstallDir = Join-Path $env:LOCALAPPDATA "PEGDWorker"
$WorkerPath = Join-Path $InstallDir "worker.py"
$LogPath    = Join-Path $InstallDir "startup.log"

Write-Host ""
Write-Host "  PEGD Compute Worker — Windows Installer" -ForegroundColor Cyan
Write-Host ""

try {

# ── 1. Find a real Python 3 (not the Windows Store stub) ─────────────────────
function Resolve-Python {
    $candidates = @()

    # Python Launcher (py.exe) — most reliable on Windows
    $py = Get-Command py.exe -ErrorAction SilentlyContinue
    if ($py) {
        try {
            $path = (& py.exe -3 -c "import sys; print(sys.executable)" 2>$null).Trim()
            if ($path -and (Test-Path $path)) { $candidates += $path }
        } catch {}
    }

    # python.exe on PATH — skip Windows Store stub (it lives in WindowsApps)
    $p = Get-Command python.exe -ErrorAction SilentlyContinue
    if ($p -and $p.Source -notlike "*WindowsApps*") {
        try {
            $ver = (& $p.Source --version 2>&1).ToString()
            if ($ver -match "Python 3") { $candidates += $p.Source }
        } catch {}
    }

    # Common user-install paths
    Get-ChildItem "$env:LOCALAPPDATA\Programs\Python\Python3*\python.exe" -ErrorAction SilentlyContinue |
        Sort-Object FullName -Descending | ForEach-Object { $candidates += $_.FullName }

    Get-ChildItem "C:\Python3*\python.exe" -ErrorAction SilentlyContinue |
        Sort-Object FullName -Descending | ForEach-Object { $candidates += $_.FullName }

    # Return first one that actually works
    foreach ($c in $candidates) {
        try {
            $out = (& $c -c "import sys; print(sys.version)" 2>$null).Trim()
            if ($out -match "^3\.") { return $c }
        } catch {}
    }
    return $null
}

Write-Host "  [1/5] Looking for Python 3..." -NoNewline

$PythonExe = Resolve-Python

if (-not $PythonExe) {
    Write-Host " not found." -ForegroundColor Yellow
    $winget = Get-Command winget.exe -ErrorAction SilentlyContinue
    if (-not $winget) {
        throw @"

Python 3 is not installed and winget is not available.

Install Python 3 from:
  https://www.python.org/downloads/windows/

Make sure to check "Add Python to PATH" during installation, then rerun this command.
"@
    }
    Write-Host "  Installing Python 3.12 via winget..." -ForegroundColor Yellow
    & winget install --id Python.Python.3.12 --exact --scope user --accept-package-agreements --accept-source-agreements
    if ($LASTEXITCODE -ne 0) { throw "Python installation via winget failed (exit $LASTEXITCODE)." }

    # Refresh PATH for this session
    $env:PATH = [System.Environment]::GetEnvironmentVariable("PATH","Machine") + ";" +
                [System.Environment]::GetEnvironmentVariable("PATH","User")

    $PythonExe = Resolve-Python
    if (-not $PythonExe) {
        throw "Python was installed but could not be found. Close this window, open a new PowerShell, and rerun."
    }
}

$pyVer = (& $PythonExe --version 2>&1).ToString().Trim()
Write-Host " $pyVer" -ForegroundColor Green
Write-Host "  [1/5] Found: $PythonExe" -ForegroundColor DarkGray

# ── 2. Check tkinter ──────────────────────────────────────────────────────────
Write-Host "  [2/5] Checking tkinter..." -NoNewline
$tkResult = & $PythonExe -c "import tkinter; print('ok')" 2>&1
if ($tkResult -notmatch "ok") {
    throw @"

tkinter is missing from your Python installation.

This usually means Python was installed from the Microsoft Store or
without the optional Tcl/Tk component.

Fix: Install Python from python.org (NOT the Microsoft Store):
  https://www.python.org/downloads/windows/
During setup, ensure "tcl/tk and IDLE" is checked.
"@
}
Write-Host " ok" -ForegroundColor Green

# ── 3. Download worker ────────────────────────────────────────────────────────
Write-Host "  [3/5] Creating install directory..." -NoNewline
New-Item -ItemType Directory -Force -Path $InstallDir | Out-Null
Write-Host " $InstallDir" -ForegroundColor DarkGray

Write-Host "  [3/5] Downloading worker.py..." -NoNewline
try {
    Invoke-WebRequest -UseBasicParsing -Uri $WorkerUrl -OutFile $WorkerPath -ErrorAction Stop
} catch {
    throw "Download failed: $($_.Exception.Message)`nURL: $WorkerUrl"
}
Unblock-File -Path $WorkerPath -ErrorAction SilentlyContinue
Write-Host " done" -ForegroundColor Green

# ── 4. Desktop shortcut ───────────────────────────────────────────────────────
Write-Host "  [4/5] Creating desktop shortcut..." -NoNewline

$PythonwExe = Join-Path (Split-Path $PythonExe) "pythonw.exe"
if (-not (Test-Path $PythonwExe)) { $PythonwExe = $PythonExe }

try {
    $Desktop      = [Environment]::GetFolderPath("Desktop")
    $ShortcutPath = Join-Path $Desktop "PEGD Worker.lnk"
    $Shell        = New-Object -ComObject WScript.Shell
    $Shortcut     = $Shell.CreateShortcut($ShortcutPath)
    $Shortcut.TargetPath      = $PythonwExe
    $Shortcut.Arguments       = "`"$WorkerPath`""
    $Shortcut.WorkingDirectory = $InstallDir
    $Shortcut.Description     = "PEGD Compute Pool GPU/CPU Worker"
    $Shortcut.Save()
    Write-Host " PEGD Worker.lnk on desktop" -ForegroundColor Green
} catch {
    Write-Host " (shortcut skipped: $($_.Exception.Message))" -ForegroundColor Yellow
}

# ── 5. First launch — use python.exe so startup errors are visible ────────────
Write-Host "  [5/5] Launching worker..." -ForegroundColor Cyan
Write-Host ""
Write-Host "  NOTE: The GUI window will open. If it closes immediately," -ForegroundColor Yellow
Write-Host "  check $LogPath for the error." -ForegroundColor Yellow
Write-Host ""

# Wrap launch in a small shim that captures any crash to a log file
$launcher = @"
import sys, traceback, subprocess, os
log = open(r'$($LogPath -replace "\\","\\\\")','w')
try:
    sys.stdout = sys.stderr = log
    exec(open(r'$($WorkerPath -replace "\\","\\\\")').read())
except Exception:
    traceback.print_exc(file=log)
    log.flush()
    import tkinter as tk
    from tkinter import messagebox
    root = tk.Tk(); root.withdraw()
    messagebox.showerror('PEGD Worker Error', traceback.format_exc())
finally:
    log.close()
"@
$launcherPath = Join-Path $InstallDir "launch.py"
Set-Content -Path $launcherPath -Value $launcher -Encoding UTF8

Start-Process -FilePath $PythonwExe -ArgumentList "`"$launcherPath`"" -WorkingDirectory $InstallDir

Write-Host "  Installation complete." -ForegroundColor Green
Write-Host "  Use the desktop shortcut to reopen. Miner binaries download on first start." -ForegroundColor DarkGray
Write-Host "  If Windows Security blocks a miner binary, add this folder to Defender exclusions:" -ForegroundColor Yellow
Write-Host "    $InstallDir\miners\" -ForegroundColor Yellow
Write-Host ""

} catch {
    Write-Host ""
    Write-Host "  INSTALLATION FAILED" -ForegroundColor Red
    Write-Host ""
    Write-Host $_.Exception.Message -ForegroundColor Red
    Write-Host ""
}

Write-Host "Press Enter to close..."
try { $null = Read-Host } catch {}
