# build_wasm.ps1
# Script to compile Zig Core to WebAssembly using the local Zig compiler.

$ErrorActionPreference = "Stop"

$workspaceDir = $PSScriptRoot
$zigExe = Join-Path $workspaceDir "tools\zig\zig.exe"
$wasmDir = Join-Path $workspaceDir "assets\wasm"

if (-not (Test-Path $zigExe)) {
    Write-Host "Fehler: Zig-Compiler wurde unter '$zigExe' nicht gefunden." -ForegroundColor Red
    Write-Host "Bitte führe zuerst './setup_zig.ps1' aus!" -ForegroundColor Yellow
    exit 1
}

# Create assets/wasm folder if it doesn't exist
if (-not (Test-Path $wasmDir)) {
    New-Item -ItemType Directory -Path $wasmDir | Out-Null
}

Write-Host "Kompiliere Zig Core zu WebAssembly..." -ForegroundColor Cyan

# Run zig build
& $zigExe build --summary all

if ($LASTEXITCODE -eq 0) {
    Write-Host "Erfolgreich kompiliert! Wasm-Datei liegt unter: assets/wasm/core.wasm" -ForegroundColor Green
} else {
    Write-Host "Fehler bei der Kompilierung!" -ForegroundColor Red
    exit 1
}
