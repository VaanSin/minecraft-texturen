# Testet die Themen-Logik ohne Minecraft zu starten.
$ErrorActionPreference = 'Stop'
$jdk = "$env:USERPROFILE\curseforge\minecraft\Install\runtime\java-runtime-epsilon\windows-x64\java-runtime-epsilon\bin"
$out = Join-Path $env:TEMP "themenwechsel-test"
if (Test-Path $out) { Remove-Item $out -Recurse -Force }
$null = New-Item -ItemType Directory -Force $out
& "$jdk\javac.exe" -encoding UTF-8 -d $out "$PSScriptRoot\src\main\java\de\mctexturen\themenwechsel\Themen.java" "$PSScriptRoot\test\ThemenTest.java"
if ($LASTEXITCODE -ne 0) { throw "Kompilieren fehlgeschlagen" }
& "$jdk\java.exe" -cp $out ThemenTest
exit $LASTEXITCODE
