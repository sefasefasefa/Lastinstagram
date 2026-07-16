# Python sanal ortamını (virtual environment) oluşturur ve
# funcaptcha solver + stealth-requests bağımlılıklarını kurar.
#
# Kullanım (PowerShell):
#   .\scripts\setup-python.ps1
#
# Gereksinim: Python 3.10+ yüklü ve PATH'te olmalı.
# Kontrol: py --version  (Windows)  ya da  python3 --version  (Linux/macOS)

$ErrorActionPreference = "Stop"

Set-Location (Join-Path $PSScriptRoot "..")

Write-Host "Python versiyonu kontrol ediliyor..."
try {
    $pyVer = & py --version 2>&1
    $pyCmd = "py"
    Write-Host "  $pyVer (py launcher)"
} catch {
    try {
        $pyVer = & python --version 2>&1
        $pyCmd = "python"
        Write-Host "  $pyVer (python)"
    } catch {
        Write-Error "Python bulunamadi. https://python.org adresinden Python 3.10+ indirin."
        exit 1
    }
}

Write-Host "Sanal ortam olusturuluyor (.venv)..."
& $pyCmd -m venv .venv
if ($LASTEXITCODE -ne 0) { Write-Error ".venv olusturulamadi."; exit 1 }

$pip = ".\.venv\Scripts\pip.exe"

Write-Host "pip guncelleniyor..."
& $pip install --upgrade pip --quiet

Write-Host "Funcaptcha solver bagimliliklar kuruluyor..."
& $pip install --no-user `
    curl_cffi flask orjson urllib3 `
    cryptography mmh3 numpy pytz requests `
    typing_extensions rich javascript wrapper_tls_requests
if ($LASTEXITCODE -ne 0) { Write-Error "Paket kurulumu basarisiz."; exit 1 }

Write-Host ""
Write-Host "Kurulum tamamlandi!" -ForegroundColor Green
Write-Host "Stealth bridge ve funcaptcha solver artik Windows'ta calisir."
Write-Host ""
Write-Host "Eger 'py' komutu API sunucusu tarafindan bulunamazsa .env dosyaniza ekleyin:"
Write-Host "  STEALTH_REQUESTS_PYTHON=.venv\Scripts\python.exe"
