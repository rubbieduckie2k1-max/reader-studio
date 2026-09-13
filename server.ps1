param(
  [int]$Port = 4173
)

$ErrorActionPreference = 'Stop'
$rootPath = [System.IO.Path]::GetFullPath($PSScriptRoot)
$rootPrefix = $rootPath.TrimEnd([System.IO.Path]::DirectorySeparatorChar) + [System.IO.Path]::DirectorySeparatorChar
$url = "http://localhost:$Port/"
$listener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback, $Port)

function Get-MimeType([string]$path) {
  switch ([System.IO.Path]::GetExtension($path).ToLowerInvariant()) {
    '.html' { return 'text/html; charset=utf-8' }
    '.css' { return 'text/css; charset=utf-8' }
    '.js' { return 'text/javascript; charset=utf-8' }
    '.json' { return 'application/json; charset=utf-8' }
    '.webmanifest' { return 'application/manifest+json; charset=utf-8' }
    '.svg' { return 'image/svg+xml' }
    '.png' { return 'image/png' }
    '.jpg' { return 'image/jpeg' }
    '.jpeg' { return 'image/jpeg' }
    '.gif' { return 'image/gif' }
    '.webp' { return 'image/webp' }
    '.ico' { return 'image/x-icon' }
    '.pdf' { return 'application/pdf' }
    '.epub' { return 'application/epub+zip' }
    '.woff' { return 'font/woff' }
    '.woff2' { return 'font/woff2' }
    default { return 'application/octet-stream' }
  }
}

function Send-Response($stream, [int]$statusCode, [string]$statusText, [string]$contentType, [byte[]]$body, [bool]$sendBody) {
  $header = "HTTP/1.1 $statusCode $statusText`r`nContent-Type: $contentType`r`nContent-Length: $($body.Length)`r`nCache-Control: no-cache`r`nConnection: close`r`n`r`n"
  $headerBytes = [System.Text.Encoding]::ASCII.GetBytes($header)
  $stream.Write($headerBytes, 0, $headerBytes.Length)
  if ($sendBody -and $body.Length -gt 0) {
    $stream.Write($body, 0, $body.Length)
  }
}

try {
  try {
    $listener.Start()
  } catch [System.Net.Sockets.SocketException] {
    Write-Host "Reader Studio may already be running at $url" -ForegroundColor Yellow
    Start-Process $url
    exit 0
  }

  Start-Process $url
  Write-Host ''
  Write-Host 'Reader Studio is running.' -ForegroundColor Green
  Write-Host "Address: $url"
  Write-Host 'Keep this window open while reading.'
  Write-Host 'Press Ctrl+C or close this window to stop.'
  Write-Host ''

  while ($true) {
    $client = $listener.AcceptTcpClient()
    $reader = $null
    $stream = $null
    try {
      $stream = $client.GetStream()
      $reader = [System.IO.StreamReader]::new($stream, [System.Text.Encoding]::ASCII, $false, 1024, $true)
      $requestLine = $reader.ReadLine()
      if ([string]::IsNullOrWhiteSpace($requestLine)) { continue }

      while ($true) {
        $line = $reader.ReadLine()
        if ([string]::IsNullOrEmpty($line)) { break }
      }

      $parts = $requestLine.Split(' ')
      if ($parts.Length -lt 2) {
        $body = [System.Text.Encoding]::UTF8.GetBytes('Invalid request.')
        Send-Response $stream 400 'Bad Request' 'text/plain; charset=utf-8' $body $true
        continue
      }

      $method = $parts[0].ToUpperInvariant()
      if ($method -ne 'GET' -and $method -ne 'HEAD') {
        $body = [System.Text.Encoding]::UTF8.GetBytes('Method not supported.')
        Send-Response $stream 405 'Method Not Allowed' 'text/plain; charset=utf-8' $body $true
        continue
      }

      $requestPath = $parts[1].Split('?')[0]
      $relativePath = [System.Uri]::UnescapeDataString($requestPath).TrimStart('/')
      if ([string]::IsNullOrWhiteSpace($relativePath)) { $relativePath = 'index.html' }
      $relativePath = $relativePath.Replace('/', [System.IO.Path]::DirectorySeparatorChar)
      $filePath = [System.IO.Path]::GetFullPath((Join-Path $rootPath $relativePath))

      if (-not $filePath.StartsWith($rootPrefix, [System.StringComparison]::OrdinalIgnoreCase)) {
        $body = [System.Text.Encoding]::UTF8.GetBytes('Access denied.')
        Send-Response $stream 403 'Forbidden' 'text/plain; charset=utf-8' $body ($method -eq 'GET')
        continue
      }

      if ([System.IO.Directory]::Exists($filePath)) {
        $filePath = Join-Path $filePath 'index.html'
      }

      if (-not [System.IO.File]::Exists($filePath)) {
        $body = [System.Text.Encoding]::UTF8.GetBytes('File not found.')
        Send-Response $stream 404 'Not Found' 'text/plain; charset=utf-8' $body ($method -eq 'GET')
        continue
      }

      $body = [System.IO.File]::ReadAllBytes($filePath)
      Send-Response $stream 200 'OK' (Get-MimeType $filePath) $body ($method -eq 'GET')
    } catch {
      try {
        $body = [System.Text.Encoding]::UTF8.GetBytes('Reader Studio could not open the file.')
        Send-Response $stream 500 'Internal Server Error' 'text/plain; charset=utf-8' $body $true
      } catch {}
    } finally {
      if ($reader) { $reader.Dispose() }
      if ($stream) { $stream.Dispose() }
      $client.Close()
    }
  }
} finally {
  $listener.Stop()
}
