# Liest alle Entity-Modelle aus dem Minecraft-Jar und schreibt sie nach public\models.json.
# Nur noetig nach einem Minecraft-Update.
param([string]$McVersion = "26.2")
$ErrorActionPreference = 'Stop'
$install = "$env:USERPROFILE\curseforge\minecraft\Install"
$jdk = "$install\runtime\java-runtime-epsilon\windows-x64\java-runtime-epsilon\bin"
$verJson = Get-Content "$install\versions\$McVersion\$McVersion.json" -Raw | ConvertFrom-Json
$paths = @("$install\versions\$McVersion\$McVersion.jar")
foreach ($lib in $verJson.libraries) {
    if ($lib.downloads.artifact.path) {
        $p = Join-Path "$install\libraries" ($lib.downloads.artifact.path -replace '/','\')
        if (Test-Path $p) { $paths += $p }
    }
}
$cp = $paths -join ';'
$out = Join-Path $env:TEMP "modeldump"
if (Test-Path $out) { Remove-Item $out -Recurse -Force }
$null = New-Item -ItemType Directory -Force $out
& "$jdk\javac.exe" -nowarn -proc:none -encoding UTF-8 -d $out -cp $cp "$PSScriptRoot\ModelDump.java"
if ($LASTEXITCODE -ne 0) { throw "Kompilieren fehlgeschlagen" }
& "$jdk\java.exe" -cp "$out;$cp" ModelDump "$PSScriptRoot\..\public\models.json"
exit $LASTEXITCODE
