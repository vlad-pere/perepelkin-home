<#
.SYNOPSIS
Обновляет A-записи доменов на DNS-серверах reg.ru при смене домашнего IP.

Если IP не указан, скрипт сам определит текущий публичный IP.

Примеры:
  .\update-dns.ps1                     # определить IP автоматически
  .\update-dns.ps1 -Ip 46.148.183.107  # указать IP вручную
  .\update-dns.ps1 -Domains "perepelkin-home.ru"   # только один домен

Логин и пароль API читаются из .env (REGRU_LOGIN, REGRU_API_PASSWORD),
либо передаются параметрами -Login / -Password.
#>

[CmdletBinding()]
param(
    [string]$Ip,
    [string]$Login,
    [string]$Password,
    [string]$Domains = "perepelkin-home.ru,perepelkin-home.online",
    [string]$Subdomains = "@,www"
)

$ErrorActionPreference = "Stop"
[Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12

$apiBase = "https://api.reg.ru/api/regru2/zone"
$settingsUrl = "https://www.reg.ru/user/account/#/settings/api/"

function Get-EnvValue {
    param([string]$Key)
    $path = Join-Path $PSScriptRoot ".env"
    if (Test-Path -LiteralPath $path) {
        foreach ($line in (Get-Content -LiteralPath $path -Encoding UTF8)) {
            $line = $line.Trim()
            if ($line -and -not $line.StartsWith("#")) {
                $m = [regex]::Match($line, "^$([regex]::Escape($Key))\s*=\s*(.*)$")
                if ($m.Success) { return $m.Groups[1].Value.Trim() }
            }
        }
    }
    return ""
}

if (-not $Login) { $Login = Get-EnvValue "REGRU_LOGIN" }
if (-not $Password) { $Password = Get-EnvValue "REGRU_API_PASSWORD" }

if (-not $Login -or -not $Password) {
    Write-Host ""
    Write-Host "НЕ ЗАДАНЫ ДОСТУПЫ К API РЕГ.РУ" -ForegroundColor Red
    Write-Host "1) Зайдите в личный кабинет reg.ru и откройте «Настройки API»:"
    Write-Host "   $settingsUrl"
    Write-Host "2) Создайте пароль для API (не путайте с паролем от кабинета)."
    Write-Host "3) В блоке «Диапазоны IP-адресов» добавьте ваш текущий IP."
    Write-Host "4) Впишите данные в файл .env рядом со скриптом:"
    Write-Host "   REGRU_LOGIN=ваш-логин@пример.ru"
    Write-Host "   REGRU_API_PASSWORD=пароль-для-API"
    Write-Host "5) Запустите скрипт снова: .\update-dns.ps1"
    Write-Host ""
    exit 1
}

if (-not $Ip) {
    Write-Host "Определяю текущий публичный IP..."
    try {
        $Ip = ((Invoke-RestMethod -Uri "https://api.ipify.org" -TimeoutSec 15) | Out-String).Trim()
    }
    catch {
        Write-Host "Не удалось определить IP автоматически." -ForegroundColor Red
        Write-Host "Запустите скрипт с указанием IP: .\update-dns.ps1 -Ip 1.2.3.4"
        exit 1
    }
}

if ($Ip -notmatch '^\d{1,3}(\.\d{1,3}){3}$') {
    Write-Host "IP «$Ip» не похож на IPv4-адрес." -ForegroundColor Red
    exit 1
}

Write-Host "Новый IP: $Ip"
Write-Host "Домены: $Domains"
Write-Host ""

function Show-RegruError {
    param($Resp)
    $code = $Resp.error_code
    $text = $Resp.error_text
    if ($code -eq "ACCESS_DENIED_FROM_IP") {
        Write-Host "Рег.ру отклонил запрос с IP $Ip — его нет в белом списке API." -ForegroundColor Red
        Write-Host "1) Откройте: $settingsUrl"
        Write-Host "2) В «Диапазоны IP-адресов» нажмите «Добавить IP» и впишите $Ip"
        Write-Host "3) Запустите скрипт снова: .\update-dns.ps1"
    }
    else {
        Write-Host "Ошибка Рег.ру [$code]: $text" -ForegroundColor Red
    }
}

function Invoke-RegruApi {
    param(
        [string]$Command,
        [hashtable]$Params
    )
    $body = @{ username = $Login; password = $Password; output_content_type = "json" }
    foreach ($k in $Params.Keys) { $body[$k] = $Params[$k] }
    try {
        return Invoke-RestMethod -Method Post -Uri "$apiBase/$Command" -Body $body -ContentType "application/x-www-form-urlencoded" -TimeoutSec 30
    }
    catch {
        throw "Запрос к Рег.ру не прошёл: $($_.Exception.Message)"
    }
}

$failed = $false

foreach ($domain in ($Domains -split "," | ForEach-Object { $_.Trim() })) {
    if (-not $domain) { continue }
    Write-Host "=== $domain ==="

    try {
        $resp = Invoke-RegruApi -Command "get_resource_records" -Params @{ domain_name = $domain }
        if ($resp.result -ne "success") {
            Show-RegruError $resp
            $failed = $true
            continue
        }

        $zone = $resp.answer.domains | Where-Object { $_.dname -eq $domain } | Select-Object -First 1
        $rrs = @($zone.rrs)

        foreach ($sub in ($Subdomains -split "," | ForEach-Object { $_.Trim() })) {
            if (-not $sub) { continue }

            $aRecords = @($rrs | Where-Object { $_.rectype -eq "A" -and $_.subname -eq $sub })
            $already = @($aRecords | Where-Object { $_.content -eq $Ip })

            if ($already.Count -gt 0) {
                Write-Host "  $sub -> $Ip (уже настроено)" -ForegroundColor Green
                continue
            }

            if ($aRecords.Count -gt 0) {
                $rm = Invoke-RegruApi -Command "remove_record" -Params @{ domain_name = $domain; subdomain = $sub; record_type = "A" }
                if ($rm.result -ne "success") {
                    Show-RegruError $rm
                    $failed = $true
                    continue
                }
            }

            $add = Invoke-RegruApi -Command "add_alias" -Params @{ domain_name = $domain; subdomain = $sub; ipaddr = $Ip }
            if ($add.result -ne "success") {
                Show-RegruError $add
                $failed = $true
                continue
            }

            Write-Host "  $sub -> $Ip (обновлено)" -ForegroundColor Green
        }
    }
    catch {
        Write-Host $_.Exception.Message -ForegroundColor Red
        $failed = $true
    }

    Write-Host ""
}

if ($failed) {
    Write-Host "Часть операций завершилась с ошибками — см. сообщения выше." -ForegroundColor Yellow
    exit 1
}

Write-Host "Готово. Новый IP $Ip прописан для всех доменов." -ForegroundColor Green
Write-Host "DNS-серверы reg.ru обновят записи в течение нескольких минут."
