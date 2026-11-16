# Minecraft Texturen

Ein einfaches, buntes Malprogramm nur für Minecraft-Texturen – für eigene **Themen** (Ressourcenpakete),
die man im Spiel mit **`/thema <name>`** umschaltet. Für Windows.

- Funktioniert mit **CurseForge**, **Modrinth App**, **Lunar Client** und dem **Minecraft Launcher** –
  das Programm findet die Profile von selbst.
- **Jede Minecraft-Version** von 1.12.2 bis 26.3: die Original-Texturen kommen direkt aus der Spieldatei
  genau dieser Version (fehlt sie, lädt das Programm sie auf Knopfdruck von Mojang).
- **Online-Konto** mit Benutzername und Passwort: eigene Themen auf jedem PC, Themen von anderen finden und
  mit einem Klick installieren.
- Es gibt **keine fertigen Themen** – du malst deine eigenen. 🎨

> Kein offizielles Minecraft-Produkt. Nicht von Mojang oder Microsoft genehmigt oder mit ihnen verbunden.
> Das Programm liefert keine Minecraft-Bilder mit; es liest sie aus deinem eigenen Spiel.

## Herunterladen und starten

1. Unter **[Releases](../../releases)** die Datei `MinecraftTexturen-<Version>-Windows.zip` laden.
2. Entpacken und **`Minecraft Texturen.exe`** starten. (Windows warnt evtl. „Unbekannter Herausgeber“ →
   „Weitere Informationen“ → „Trotzdem ausführen“.) Node.js ist schon dabei – nichts installieren.
3. Thema anlegen → Textur wählen → malen → **Speichern** → Profil wählen. Fertig.
4. Im Spiel: `/thema <name>` bzw. `/thema normal` (Minecraft-Original).

## Was das Programm kann

- **Alle Texturen**: Blöcke, Items, Mobs, Rüstung, GUI, Partikel … mit Suche (versteht auch deutsche Wörter
  wie „herz“, „schwert“, „schwein“).
- **Werkzeuge**: Stift, Schattenpinsel (dunklere Pixel drumherum oder Licht von oben/links), **Muster**
  (zufällige Töne *oder* nur Farben, die du vorher auswählst – mit passenden Farbvorschlägen), Heller,
  Dunkler, Sprühen, Radierer (genau 1 Pixel), Eimer, Verlauf, Linie, Rechteck, Kreis, Umriss, Auswahl,
  Pipette, Dichte, Tauschen. Spiegel-Malen ↔ ↕. **Pinselgröße 1–32** (Regler oder Tasten `[` `]`).
- **Farben der Textur**: jede Farbe anklicken → damit malen, in dieser Textur ersetzen oder in **allen**
  Texturen ersetzen (mit Rückgängig).
- **3D-Ansicht** für Blöcke, Items, Mobs und Rüstung am Spieler.
- **Mehr Pixel**: Auflösung verdoppeln/vervierfachen (z. B. für Bossleisten); Animationen wachsen mit.
- **Hinweise** unten links (abschaltbar): fast unsichtbare Restpixel, falsche Größe, Durchsichtigkeit …
- **Viele Texturen, einmal speichern**: bearbeitete Texturen bleiben Entwurf, „Alles speichern“ speichert alle.

## Der Befehl `/thema`

Beim Speichern legt das Programm die passende kleine Mod „Themenwechsel“ automatisch in den
`mods`-Ordner des Profils:

| Loader | Minecraft |
|---|---|
| Fabric (auch Lunar Client) | 26.1.x, 26.2.x, 26.3.x, 1.20.1 |
| NeoForge | 1.21.1, 1.21.8 |
| Forge | 1.20.1, 1.19.2 |

Fabric braucht zusätzlich die **Fabric API**. Für andere Versionen oder ohne Mod-Loader (Minecraft Launcher
„Vanilla“) gibt es im Thema-Menü **„Im Spiel einschalten“** – das trägt das Thema in die `options.txt` ein
(wirkt beim nächsten Spielstart).

Ein Thema ist ein normaler Ressourcenpaket-Ordner `resourcepacks/Thema-<Name>` im Profil. Die Mod-Dateien
gibt es auch einzeln bei den Releases.

**Extra (Fabric 26.x):** Bringt ein Thema ein Bild `textures/entity/equipment/krempe/<material>.png` mit
(64×32), zeichnet die Mod eine breite, runde Hutkrempe auf den Helm dieses Materials.

## Online-Konto

Oben auf **👤 Anmelden** → Benutzername + Passwort (keine E-Mail nötig). Danach im Thema-Menü:

- **⬆️ Online speichern** – öffentlich (andere finden es) oder nur für dich.
- **☁️ Meine Online-Themen** – auf jedem PC holen, sichtbar/privat schalten, löschen.
- **🌍 Themen von anderen** – suchen, nach Version filtern, installieren. Themen aus einer anderen
  Minecraft-Version werden angepasst (nur Texturen, die es dort gibt).

Achtung: Ohne E-Mail kann ein vergessenes Passwort nicht zurückgesetzt werden.

Der Online-Speicher ist ein [Supabase](https://supabase.com)-Projekt. Wer das Programm selbst betreiben
will: [docs/supabase-einrichten.md](docs/supabase-einrichten.md) und [docs/supabase.sql](docs/supabase.sql),
dann URL und öffentlichen Schlüssel in `editor/konto.json` eintragen.

## Für Entwickler

```
editor/            Programm (Node.js ohne Abhängigkeiten + Browser-Oberfläche, Fenster über Microsoft Edge)
  server.mjs       lokaler Server (127.0.0.1:47811)
  lib/             Profile aller Launcher, Zip/PNG, Themen, Online-Konto
  public/          Oberfläche (Vanilla JS, Three.js für 3D)
  mod-dateien/     fertige /thema-Mods
  tools/           Selbsttest, Testserver, Supabase-Nachbau, Paket bauen
mod/               Mod „Themenwechsel“ (Java, ohne Gradle gebaut)
docs/              Online-Speicher einrichten
```

- Start: `cd editor` → `node --no-warnings server.mjs --app` (Node.js ≥ 22.13)
- Selbsttest: `node --no-warnings tools/selbsttest.mjs`
- Testserver gegen Kopien aller Profile + Supabase-Nachbau: `node --no-warnings tools/testserver.mjs --neu` (Port 47812)
- Mods bauen: `node mod/tools/baue-alle.mjs` (braucht die jeweiligen Minecraft-Versionen lokal installiert);
  Tests: `mod/test.ps1`, `mod/test-alle.ps1`
- Release-Paket: `node editor/tools/paket.mjs` → `release/`

## Lizenz

MIT – siehe [LICENSE](LICENSE). Three.js: MIT (`editor/public/vendor/THREE-LICENSE.txt`).
