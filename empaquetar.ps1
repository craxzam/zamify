# Compila Zamify y deja el .zip para distribuir en la carpeta "dist".
$ErrorActionPreference = 'Stop'
[xml]$proyecto = Get-Content -LiteralPath "$PSScriptRoot\Zamify.csproj" -Encoding UTF8
$version = "$($proyecto.Project.PropertyGroup.Version)".Trim()
$dist = "$PSScriptRoot\dist"
$salida = "$dist\Zamify"
if (Test-Path -LiteralPath $salida) { Remove-Item -LiteralPath $salida -Recurse -Force -Confirm:$false }
dotnet build "$PSScriptRoot\Zamify.csproj" -c Release -o $salida
if ($LASTEXITCODE) { throw 'La compilación falló.' }
Remove-Item "$salida\*.xml" -Confirm:$false   # documentación que la app no usa
Copy-Item "$PSScriptRoot\LICENSE", "$PSScriptRoot\TERCEROS.txt", "$PSScriptRoot\crear-acceso-directo.ps1" $salida
Compress-Archive -Path $salida -DestinationPath "$dist\Zamify-$version-win-x64.zip" -Force
Write-Output "Listo: $dist\Zamify-$version-win-x64.zip"
