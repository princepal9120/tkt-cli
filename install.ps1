# Copyright (C) 2025 princepal9120
# SPDX-License-Identifier: MIT
#
# Install tkt-cli on Windows
# Usage: irm https://raw.githubusercontent.com/princepal9120/tkt-cli/main/install.ps1 | iex

$ErrorActionPreference = "Stop"

$Repo       = "princepal9120/tkt-cli"
$BinaryName = "tkt.exe"
$InstallDir = "$env:USERPROFILE\.local\bin"

function Write-Info    { param($M) Write-Host "🔍 $M" -ForegroundColor Cyan }
function Write-Success { param($M) Write-Host "✓ $M"  -ForegroundColor Green }
function Write-Warn    { param($M) Write-Host "⚠ $M"  -ForegroundColor Yellow }
function Write-Err     { param($M) Write-Host "❌ $M" -ForegroundColor Red }

function Get-Arch {
    $a = [System.Runtime.InteropServices.RuntimeInformation]::OSArchitecture
    switch ($a) {
        "X64"   { return "x64" }
        "Arm64" { return "arm64" }
        default { throw "Unsupported architecture: $a" }
    }
}

function Get-LatestVersion {
    Write-Info "Fetching latest version..."
    $rel = Invoke-RestMethod -Uri "https://api.github.com/repos/$Repo/releases/latest" `
        -Headers @{ "User-Agent" = "tkt-cli-installer" }
    return $rel.tag_name
}

function Install-Tkt {
    Write-Host ""
    Write-Host "  ████████╗██╗  ██╗████████╗      ██████╗██╗     ██╗" -ForegroundColor Cyan
    Write-Host "     ██╔══╝██║ ██╔╝╚══██╔══╝     ██╔════╝██║     ██║" -ForegroundColor Cyan
    Write-Host "     ██║   █████╔╝    ██║        ██║     ██║     ██║" -ForegroundColor Cyan
    Write-Host "     ██║   ██╔═██╗    ██║        ██║     ██║     ██║" -ForegroundColor Cyan
    Write-Host "     ██║   ██║  ██╗   ██║        ╚██████╗███████╗██║" -ForegroundColor Cyan
    Write-Host "     ╚═╝   ╚═╝  ╚═╝   ╚═╝         ╚═════╝╚══════╝╚═╝" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "      TikTok in your terminal — tkt-cli installer" -ForegroundColor Green
    Write-Host ""

    $arch    = Get-Arch
    Write-Info "Detected: windows-$arch"

    $version = Get-LatestVersion
    Write-Info "Latest version: $version"

    $asset       = "tkt-windows-$arch.exe"
    $downloadUrl = "https://github.com/$Repo/releases/download/$version/$asset"
    $checksumUrl = "$downloadUrl.sha256"

    $tempDir      = New-Item -ItemType Directory -Path (Join-Path $env:TEMP "tkt-install-$(Get-Random)")
    $tempBinary   = Join-Path $tempDir $BinaryName
    $tempChecksum = Join-Path $tempDir "$asset.sha256"

    try {
        Write-Info "Downloading $asset..."
        Invoke-WebRequest -Uri $downloadUrl -OutFile $tempBinary -UseBasicParsing

        Write-Info "Verifying checksum..."
        try {
            Invoke-WebRequest -Uri $checksumUrl -OutFile $tempChecksum -UseBasicParsing
            $expected = (Get-Content $tempChecksum).Split(" ")[0].ToUpper()
            $actual   = (Get-FileHash -Path $tempBinary -Algorithm SHA256).Hash.ToUpper()
            if ($expected -eq $actual) {
                Write-Success "Checksum verified"
            } else {
                Write-Warn "Checksum mismatch (continuing anyway)"
            }
        } catch {
            Write-Warn "Could not verify checksum (continuing)"
        }

        if (-not (Test-Path $InstallDir)) {
            New-Item -ItemType Directory -Path $InstallDir -Force | Out-Null
        }

        $installPath = Join-Path $InstallDir $BinaryName
        Copy-Item -Path $tempBinary -Destination $installPath -Force
        Write-Success "Installed → $installPath"

        # PATH check
        $userPath = [Environment]::GetEnvironmentVariable("PATH", "User")
        if ($userPath -notlike "*$InstallDir*") {
            Write-Warn "$InstallDir is not in your PATH"
            Write-Host ""
            Write-Host "  Add automatically? Run:" -ForegroundColor Yellow
            Write-Host "  [Environment]::SetEnvironmentVariable('PATH', `$env:PATH + ';$InstallDir', 'User')" -ForegroundColor White
            Write-Host ""
            $add = Read-Host "  Add to PATH now? (y/N)"
            if ($add -in @("y","Y")) {
                [Environment]::SetEnvironmentVariable("PATH", "$userPath;$InstallDir", "User")
                $env:PATH += ";$InstallDir"
                Write-Success "Added to PATH (restart terminal to take effect)"
            }
        }

        Write-Host ""
        Write-Success "Done! Run 'tkt --help' to get started."
        Write-Host ""

    } finally {
        Remove-Item -Path $tempDir -Recurse -Force -ErrorAction SilentlyContinue
    }
}

Install-Tkt
