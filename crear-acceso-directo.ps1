# Crea el acceso directo "Zamify" en el escritorio.
param([string]$Exe = (Join-Path $PSScriptRoot 'Zamify.exe'))
if (-not (Test-Path -LiteralPath $Exe)) { throw "No encuentro $Exe. Indica la ruta con -Exe." }
$Exe = (Resolve-Path -LiteralPath $Exe).ProviderPath
$s = (New-Object -ComObject WScript.Shell).CreateShortcut((Join-Path ([Environment]::GetFolderPath('Desktop')) 'Zamify.lnk'))
$s.TargetPath = $Exe
$s.WorkingDirectory = Split-Path $Exe
$s.Save()
