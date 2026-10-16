param(
  [ValidateSet('start', 'stop')][string]$Action = 'start',
  [string]$PgBin = 'C:\Program Files\PostgreSQL\17\bin'
)
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
$localDir = Join-Path $projectRoot '.local'
$dataDir = Join-Path $localDir 'postgres'
$logFile = Join-Path $localDir 'postgres.log'
$pgCtl = Join-Path $PgBin 'pg_ctl.exe'
if (-not (Test-Path -LiteralPath $pgCtl)) { throw "PostgreSQL não encontrado em $PgBin. Informe -PgBin ou utilize Docker." }
if ($Action -eq 'stop') {
  & $pgCtl -D $dataDir -m fast -w stop
  if ($LASTEXITCODE -ne 0) { throw 'Não foi possível parar a instância do projeto.' }
  exit
}
New-Item -ItemType Directory -Force -Path $localDir | Out-Null
if (-not (Test-Path -LiteralPath (Join-Path $dataDir 'PG_VERSION'))) {
  $passwordFile = Join-Path $localDir 'pg-password.txt'
  Set-Content -LiteralPath $passwordFile -Value 'supervalidade' -Encoding ascii
  & (Join-Path $PgBin 'initdb.exe') -D $dataDir -U supervalidade "--pwfile=$passwordFile" --auth-host=scram-sha-256 --auth-local=trust --encoding=UTF8 --locale=C
  if ($LASTEXITCODE -ne 0) { throw 'Falha na inicialização do PostgreSQL local.' }
}
& $pgCtl -D $dataDir status *> $null
if ($LASTEXITCODE -ne 0) {
  $arguments = "-D `"$dataDir`" -l `"$logFile`" -o `"-h 127.0.0.1 -p 55432`" -w start"
  $process = Start-Process -FilePath $pgCtl -ArgumentList $arguments -WindowStyle Hidden -Wait -PassThru
  if ($process.ExitCode -ne 0) { throw "Falha na inicialização. Consulte $logFile. A porta 55432 deve estar livre." }
}
$previousPassword = $env:PGPASSWORD
try {
  $env:PGPASSWORD = 'supervalidade'
  foreach ($database in @('supervalidade', 'supervalidade_test')) {
    $exists = & (Join-Path $PgBin 'psql.exe') -h 127.0.0.1 -p 55432 -U supervalidade -d postgres -tAc "SELECT 1 FROM pg_database WHERE datname = '$database'"
    if ($LASTEXITCODE -ne 0) { throw 'Falha ao consultar os bancos locais.' }
    if ($exists -ne '1') {
      & (Join-Path $PgBin 'createdb.exe') -h 127.0.0.1 -p 55432 -U supervalidade $database
      if ($LASTEXITCODE -ne 0) { throw "Falha ao criar $database." }
    }
  }
} finally { $env:PGPASSWORD = $previousPassword }
Write-Host 'PostgreSQL do projeto disponível em 127.0.0.1:55432. Dados preservados em .local/postgres.'
