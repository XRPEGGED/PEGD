$ErrorActionPreference = "Stop"

$WorkerUrl = "https://pegd.org/worker.py"
$InstallDir = Join-Path $env:LOCALAPPDATA "PEGDWorker"
$WorkerPath = Join-Path $InstallDir "worker.py"

function Resolve-Python {
    $launcher = Get-Command py.exe -ErrorAction SilentlyContinue
    if ($launcher) {
        try {
            $resolved = (& $launcher.Source -3 -c "import sys; print(sys.executable)" 2>$null).Trim()
            if ($resolved -and (Test-Path $resolved)) {
                return $resolved
            }
        } catch {}
    }

    $python = Get-Command python.exe -ErrorAction SilentlyContinue
    if ($python) {
        try {
            & $python.Source -c "import sys" 2>$null
            if ($LASTEXITCODE -eq 0) {
                return $python.Source
            }
        } catch {}
    }

    $pattern = Join-Path $env:LOCALAPPDATA "Programs\Python\Python*\python.exe"
    $localPython = Get-ChildItem $pattern -ErrorAction SilentlyContinue |
        Sort-Object FullName -Descending |
        Select-Object -First 1
    if ($localPython) {
        return $localPython.FullName
    }

    return $null
}

Write-Host ""
Write-Host "PEGD Compute Worker - Windows Installer" -ForegroundColor Cyan
Write-Host ""

$PythonExe = Resolve-Python
if (-not $PythonExe) {
    $winget = Get-Command winget.exe -ErrorAction SilentlyContinue
    if (-not $winget) {
        throw "Python 3 was not found. Install it from https://python.org/downloads/windows/ and rerun this command."
    }

    Write-Host "Installing Python 3 with winget..." -ForegroundColor Yellow
    & $winget.Source install --id Python.Python.3.12 --exact --scope user --accept-package-agreements --accept-source-agreements
    if ($LASTEXITCODE -ne 0) {
        throw "Python installation failed."
    }

    $PythonExe = Resolve-Python
    if (-not $PythonExe) {
        throw "Python was installed, but Windows has not refreshed PATH yet. Open a new PowerShell window and rerun the installer."
    }
}

& $PythonExe -c "import tkinter"
if ($LASTEXITCODE -ne 0) {
    throw "This Python installation does not include tkinter. Install Python from python.org with Tcl/Tk enabled."
}

New-Item -ItemType Directory -Force -Path $InstallDir | Out-Null
Write-Host "Downloading PEGD Worker..." -ForegroundColor Cyan
Invoke-WebRequest -UseBasicParsing -Uri $WorkerUrl -OutFile $WorkerPath
Unblock-File -Path $WorkerPath

$PythonwExe = Join-Path (Split-Path $PythonExe) "pythonw.exe"
if (-not (Test-Path $PythonwExe)) {
    $PythonwExe = $PythonExe
}

$Quote = [char]34
$Desktop = [Environment]::GetFolderPath("Desktop")
$ShortcutPath = Join-Path $Desktop "PEGD Worker.lnk"
$Shell = New-Object -ComObject WScript.Shell
$Shortcut = $Shell.CreateShortcut($ShortcutPath)
$Shortcut.TargetPath = $PythonwExe
$Shortcut.Arguments = "$Quote$WorkerPath$Quote"
$Shortcut.WorkingDirectory = $InstallDir
$Shortcut.IconLocation = "$PythonExe,0"
$Shortcut.Description = "PEGD Compute Pool GPU/CPU Worker"
$Shortcut.Save()

# Set "Run as administrator" flag on the shortcut (byte 0x15, bit 0x20)
# Required for XMRig MSR mod — boosts RandomX hashrate 15-25%
$bytes = [System.IO.File]::ReadAllBytes($ShortcutPath)
$bytes[0x15] = $bytes[0x15] -bor 0x20
[System.IO.File]::WriteAllBytes($ShortcutPath, $bytes)

Write-Host ""
Write-Host "Installed. A PEGD Worker shortcut was added to your desktop." -ForegroundColor Green
Write-Host "Miner binaries download from their official GitHub releases on first start." -ForegroundColor DarkGray
Write-Host "Windows Security may flag mining software. Review the source before allowing any blocked binary." -ForegroundColor Yellow

Start-Process -FilePath $PythonwExe -ArgumentList "$Quote$WorkerPath$Quote" -WorkingDirectory $InstallDir
