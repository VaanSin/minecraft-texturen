# Testet den gemeinsamen /thema-Befehl (alle Loader) und die Beschreibungsdateien der gebauten Jars.
$ErrorActionPreference = 'Stop'
$lib = "$env:USERPROFILE\curseforge\minecraft\Install\libraries"
$jdk = "$env:USERPROFILE\curseforge\minecraft\Install\runtime\java-runtime-epsilon\windows-x64\java-runtime-epsilon\bin"
$brig = Get-ChildItem "$lib\com\mojang\brigadier" -Recurse -Filter *.jar | Sort-Object FullName -Descending | Select-Object -First 1
$toml = Get-ChildItem "$lib\com\electronwill\night-config" -Recurse -Filter *.jar | Where-Object Name -match '^(core|toml)-3\.' | Group-Object { $_.Name -replace '-.*' } | ForEach-Object { $_.Group | Sort-Object Name -Descending | Select-Object -First 1 }
$cp = (@($brig.FullName) + ($toml | ForEach-Object FullName)) -join ';'
$out = Join-Path $env:TEMP "themenwechsel-befehltest"
if (Test-Path $out) { Remove-Item $out -Recurse -Force }
$null = New-Item -ItemType Directory -Force $out
& "$jdk\javac.exe" -encoding UTF-8 -cp $cp -d $out "$PSScriptRoot\src\main\java\de\mctexturen\themenwechsel\Themen.java" "$PSScriptRoot\multi\Befehl.java" "$PSScriptRoot\test\BefehlTest.java"
if ($LASTEXITCODE -ne 0) { throw "Kompilieren fehlgeschlagen" }
$jars = Get-ChildItem "$PSScriptRoot\build" -Filter 'themenwechsel-*-*.jar' | ForEach-Object FullName
& "$jdk\java.exe" -cp "$out;$cp" BefehlTest @jars
exit $LASTEXITCODE
