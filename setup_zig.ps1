# setup_zig.ps1
# Script to download and set up a local portable Zig compiler for the workspace.

$ErrorActionPreference = "Stop"

$workspaceDir = $PSScriptRoot
$toolsDir = Join-Path $workspaceDir "tools"
$zigDir = Join-Path $toolsDir "zig"
$zipPath = Join-Path $toolsDir "zig.zip"
$tempExtractDir = Join-Path $toolsDir "zig_temp"

# 1. Create tools directory
if (-not (Test-Path $toolsDir)) {
    Write-Host "Erstelle Ordner 'tools'..." -ForegroundColor Cyan
    New-Item -ItemType Directory -Path $toolsDir | Out-Null
}

# 2. Download Zig if it doesn't exist
if (-not (Test-Path $zigDir)) {
    $zigUrl = "https://ziglang.org/download/0.13.0/zig-windows-x86_64-0.13.0.zip"
    Write-Host "Lade portable Version von Zig 0.13.0 herunter (ca. 22 MB)..." -ForegroundColor Cyan
    Write-Host "Quelle: $zigUrl" -ForegroundColor Gray
    
    # Use WebClient or Invoke-WebRequest
    [System.Net.ServicePointManager]::SecurityProtocol = [System.Net.SecurityProtocolType]::Tls12
    Invoke-WebRequest -Uri $zigUrl -OutFile $zipPath -UseBasicParsing
    
    # 3. Extract Zip
    Write-Host "Entpacke Zig compiler..." -ForegroundColor Cyan
    if (Test-Path $tempExtractDir) {
        Remove-Item -Recurse -Force $tempExtractDir
    }
    New-Item -ItemType Directory -Path $tempExtractDir | Out-Null
    
    Expand-Archive -Path $zipPath -DestinationPath $tempExtractDir -Force
    
    # 4. Move files to permanent location
    Write-Host "Richte Compiler-Dateien ein..." -ForegroundColor Cyan
    $extractedFolder = Get-ChildItem -Path $tempExtractDir | Select-Object -First 1
    if ($extractedFolder) {
        Move-Item -Path $extractedFolder.FullName -Destination $zigDir
    } else {
        throw "Entpackter Zig-Ordner nicht gefunden."
    }
    
    # 5. Clean up temporary files
    Write-Host "Bereinige temporäre Dateien..." -ForegroundColor Cyan
    if (Test-Path $zipPath) { Remove-Item -Force $zipPath }
    if (Test-Path $tempExtractDir) { Remove-Item -Recurse -Force $tempExtractDir }
    
    Write-Host "Zig Compiler wurde erfolgreich in 'tools/zig/' eingerichtet!" -ForegroundColor Green
} else {
    Write-Host "Zig Compiler ist bereits unter 'tools/zig/' eingerichtet." -ForegroundColor Green
}

# Verify local compiler version
$zigExe = Join-Path $zigDir "zig.exe"
if (Test-Path $zigExe) {
    $version = & $zigExe version
    Write-Host "Lokale Zig-Version: $version" -ForegroundColor Green
} else {
    Write-Warning "Zig-Compiler wurde eingerichtet, aber zig.exe wurde nicht unter '$zigExe' gefunden."
}
