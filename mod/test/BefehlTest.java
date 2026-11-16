import com.electronwill.nightconfig.core.Config;
import com.electronwill.nightconfig.toml.TomlParser;
import com.mojang.brigadier.CommandDispatcher;
import com.mojang.brigadier.suggestion.Suggestion;
import de.mctexturen.themenwechsel.Befehl;

import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Collection;
import java.util.List;
import java.util.stream.Collectors;
import java.util.zip.ZipFile;

/**
 * Prueft den gemeinsamen /thema-Befehl mit echtem Brigadier und einem nachgebauten Spiel,
 * und liest die mods.toml der gebauten Jars mit NightConfig (wie Forge/NeoForge beim Start).
 * Aufruf ueber test-alle.ps1.
 */
public class BefehlTest {
    static int fehler = 0;
    static void pruefe(String was, boolean ok, Object info) {
        System.out.println((ok ? "  ok     " : "  FEHLER ") + was + (ok ? "" : "  -> " + info));
        if (!ok) fehler++;
    }

    static class FakeSpiel implements Befehl.Spiel {
        List<String> verfuegbar = List.of("vanilla", "mod_resources", "file/Border-Gruen", "file/Border-Rot", "file/Fresh.zip");
        List<String> ausgewaehlt = new ArrayList<>(List.of("vanilla", "mod_resources", "file/Fresh.zip"));
        int gesetzt = 0;
        public Collection<String> verfuegbar() { return verfuegbar; }
        public Collection<String> ausgewaehlt() { return ausgewaehlt; }
        public void setze(List<String> ids) { ausgewaehlt = new ArrayList<>(ids); gesetzt++; }
    }

    public static void main(String[] args) throws Exception {
        FakeSpiel spiel = new FakeSpiel();
        List<String> chat = new ArrayList<>();
        CommandDispatcher<Object> d = new CommandDispatcher<>();
        d.register(Befehl.<Object>baue(spiel, (quelle, text) -> chat.add(text)));
        Object quelle = new Object();

        d.execute("thema", quelle);
        pruefe("/thema zeigt Liste", chat.size() == 3 && chat.get(0).contains("normal") && chat.get(1).contains("gruen") && chat.get(1).contains("rot"), chat);
        chat.clear();
        d.execute("thema gruen", quelle);
        pruefe("/thema gruen schaltet um", spiel.ausgewaehlt.equals(List.of("vanilla", "mod_resources", "file/Fresh.zip", "file/Border-Gruen")), spiel.ausgewaehlt);
        pruefe("Meldung", chat.get(0).contains("gruen"), chat);
        chat.clear();
        d.execute("thema grün", quelle);
        pruefe("/thema grün: schon aktiv, nichts neu geladen", spiel.gesetzt == 1 && chat.get(0).contains("schon aktiv"), chat);
        d.execute("thema rot", quelle);
        pruefe("/thema rot ersetzt gruen", spiel.ausgewaehlt.equals(List.of("vanilla", "mod_resources", "file/Fresh.zip", "file/Border-Rot")), spiel.ausgewaehlt);
        d.execute("thema normal", quelle);
        pruefe("/thema normal", spiel.ausgewaehlt.equals(List.of("vanilla", "mod_resources", "file/Fresh.zip")), spiel.ausgewaehlt);
        chat.clear();
        d.execute("thema blau", quelle);
        pruefe("unbekanntes Thema", chat.get(0).contains("Kein Thema"), chat);
        List<String> vorschlaege = d.getCompletionSuggestions(d.parse("thema ", quelle)).get().getList().stream().map(Suggestion::getText).collect(Collectors.toList());
        pruefe("Vorschläge: " + vorschlaege, vorschlaege.containsAll(List.of("normal", "gruen", "rot")), vorschlaege);
        List<String> g = d.getCompletionSuggestions(d.parse("thema g", quelle)).get().getList().stream().map(Suggestion::getText).collect(Collectors.toList());
        pruefe("Vorschläge für \"g\": " + g, g.equals(List.of("gruen")), g);

        // mods.toml der gebauten Jars lesen
        for (String jar : args) {
            try (ZipFile z = new ZipFile(jar)) {
                var e = z.getEntry("META-INF/neoforge.mods.toml");
                if (e == null) e = z.getEntry("META-INF/mods.toml");
                if (e == null) { pruefe(jar + ": fabric.mod.json vorhanden", z.getEntry("fabric.mod.json") != null, "fehlt"); continue; }
                String text = new String(z.getInputStream(e).readAllBytes(), StandardCharsets.UTF_8);
                Config c = new TomlParser().parse(text);
                List<Config> mods = c.get("mods");
                List<Config> deps = c.get("dependencies.themenwechsel");
                boolean ok = "javafml".equals(c.get("modLoader")) && mods.size() == 1 && "themenwechsel".equals(mods.get(0).get("modId")) && deps.size() == 2;
                pruefe(new java.io.File(jar).getName() + ": " + e.getName() + " lesbar, " + deps.size() + " Abhängigkeiten", ok, text);
            }
        }
        System.out.println(fehler == 0 ? "Alle Tests bestanden." : fehler + " Test(s) fehlgeschlagen.");
        System.exit(fehler == 0 ? 0 : 1);
    }
}
