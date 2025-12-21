# PowerShell script to start Chrome with remote debugging (Windows)
# Usage: .\scripts\start-chrome.ps1

$CHROME_DEBUG_PORT = if ($env:CHROME_DEBUG_PORT) { $env:CHROME_DEBUG_PORT } else { "9222" }
$USER_DATA_DIR = if ($env:CHROME_USER_DATA_DIR) { $env:CHROME_USER_DATA_DIR } else { ".\chrome-data" }

Write-Host "🚀 Starting Chrome with remote debugging on port $CHROME_DEBUG_PORT" -ForegroundColor Green

# Create user data directory if it doesn't exist
if (-not (Test-Path $USER_DATA_DIR)) {
    New-Item -ItemType Directory -Path $USER_DATA_DIR | Out-Null
}

# Find Chrome executable
$chromePaths = @(
    "${env:ProgramFiles}\Google\Chrome\Application\chrome.exe",
    "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe",
    "${env:LOCALAPPDATA}\Google\Chrome\Application\chrome.exe"
)

$chromeExe = $null
foreach ($path in $chromePaths) {
    if (Test-Path $path) {
        $chromeExe = $path
        break
    }
}

if (-not $chromeExe) {
    Write-Host "❌ Chrome not found. Please install Google Chrome." -ForegroundColor Red
    exit 1
}

# Start Chrome with remote debugging
$chromeArgs = @(
    "--remote-debugging-port=$CHROME_DEBUG_PORT",
    "--no-sandbox",
    "--disable-setuid-sandbox",
    "--disable-dev-shm-usage",
    "--disable-accelerated-2d-canvas",
    "--disable-gpu",
    "--window-size=1920,1080",
    "--disable-blink-features=AutomationControlled",
    "--user-data-dir=$USER_DATA_DIR",
    "--disable-web-security",
    "--disable-features=VizDisplayCompositor",
    "https://gemini.google.com/app"
)

$process = Start-Process -FilePath $chromeExe -ArgumentList $chromeArgs -PassThru

Write-Host "✅ Chrome started with PID: $($process.Id)" -ForegroundColor Green
Write-Host "📊 Debugging port: $CHROME_DEBUG_PORT" -ForegroundColor Cyan
Write-Host "💾 User data directory: $USER_DATA_DIR" -ForegroundColor Cyan
Write-Host ""
Write-Host "To stop Chrome, run: Stop-Process -Id $($process.Id)" -ForegroundColor Yellow

# Save PID to file
$process.Id | Out-File -FilePath "chrome.pid" -Encoding ASCII

