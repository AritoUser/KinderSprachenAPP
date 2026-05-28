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
    Write-Host "Creating 'tools' directory..." -ForegroundColor Cyan
    New-Item -ItemType Directory -Path $toolsDir | Out-Null
}

# 2. Download Zig if it doesn't exist
if (-not (Test-Path $zigDir)) {
    $zigUrl = "https://ziglang.org/download/0.13.0/zig-windows-x86_64-0.13.0.zip"
    Write-Host "Downloading portable Zig 0.13.0 compiler (approx. 22 MB)..." -ForegroundColor Cyan
    Write-Host "Source: $zigUrl" -ForegroundColor Gray
    
    [System.Net.ServicePointManager]::SecurityProtocol = [System.Net.SecurityProtocolType]::Tls12
    Invoke-WebRequest -Uri $zigUrl -OutFile $zipPath -UseBasicParsing
    
    # 3. Extract Zip
    Write-Host "Extracting Zig compiler..." -ForegroundColor Cyan
    if (Test-Path $tempExtractDir) {
        Remove-Item -Recurse -Force $tempExtractDir
    }
    New-Item -ItemType Directory -Path $tempExtractDir | Out-Null
    
    Expand-Archive -Path $zipPath -DestinationPath $tempExtractDir -Force
    
    # 4. Move files to permanent location
    Write-Host "Setting up compiler files..." -ForegroundColor Cyan
    $extractedFolder = Get-ChildItem -Path $tempExtractDir | Select-Object -First 1
    if ($extractedFolder) {
        Move-Item -Path $extractedFolder.FullName -Destination $zigDir
    } else {
        throw "Extracted Zig folder not found."
    }
    
    # 5. Clean up temporary files
    Write-Host "Cleaning up temporary files..." -ForegroundColor Cyan
    if (Test-Path $zipPath) { Remove-Item -Force $zipPath }
    if (Test-Path $tempExtractDir) { Remove-Item -Recurse -Force $tempExtractDir }
    
    Write-Host "Zig compiler set up successfully in 'tools/zig/'!" -ForegroundColor Green
} else {
    Write-Host "Zig compiler is already set up in 'tools/zig/'." -ForegroundColor Green
}

# Verify local compiler version
$zigExe = Join-Path $zigDir "zig.exe"
if (Test-Path $zigExe) {
    $version = & $zigExe version
    Write-Host "Local Zig version: $version" -ForegroundColor Green
} else {
    Write-Warning "Zig compiler was set up, but zig.exe was not found under '$zigExe'."
}
