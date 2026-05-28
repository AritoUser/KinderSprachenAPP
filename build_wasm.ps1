# build_wasm.ps1
# Script to compile Zig Core to WebAssembly using the local Zig compiler.

$ErrorActionPreference = "Stop"

$workspaceDir = $PSScriptRoot
$zigExe = Join-Path $workspaceDir "tools\zig\zig.exe"
$wasmDir = Join-Path $workspaceDir "assets\wasm"

if (-not (Test-Path $zigExe)) {
    Write-Host "Error: Zig compiler was not found at '$zigExe'." -ForegroundColor Red
    Write-Host "Please run './setup_zig.ps1' first!" -ForegroundColor Yellow
    exit 1
}

# Create assets/wasm folder if it doesn't exist
if (-not (Test-Path $wasmDir)) {
    New-Item -ItemType Directory -Path $wasmDir | Out-Null
}

Write-Host "Compiling Zig Core to WebAssembly..." -ForegroundColor Cyan

# Run zig build
& $zigExe build --summary all

if ($LASTEXITCODE -eq 0) {
    Write-Host "Successfully compiled! Wasm file located at: assets/wasm/core.wasm" -ForegroundColor Green
} else {
    Write-Host "Compilation failed!" -ForegroundColor Red
    exit 1
}
