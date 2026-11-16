package de.mctexturen.themenwechsel;

import java.util.ArrayList;
import java.util.Collection;
import java.util.List;
import java.util.Locale;
import java.util.Optional;
import java.util.TreeMap;

/**
 * Reine Logik ohne Minecraft-Klassen, damit sie sich ohne Spielstart testen laesst.
 *
 * Ein Thema ist ein Ressourcenpaket im resourcepacks-Ordner, dessen Name mit "Thema-"
 * beginnt, z. B. der Ordner "Thema-Lila Nacht". Minecraft fuehrt es unter der Id
 * "file/Thema-Lila Nacht". Der Name, den man im Befehl tippt, ist der Teil hinter "Thema-",
 * klein geschrieben, ohne Leerzeichen und Umlaute: "lilanacht" (auch "Lila Nacht" wird verstanden).
 * Aeltere Themen mit "Border-" am Anfang zaehlen weiterhin mit.
 */
public final class Themen {
    /** Neue Themen heissen "Thema-<Name>", die ersten hiessen "Border-<Name>". */
    public static final String[] PREFIXE = { "file/Thema-", "file/Border-" };
    public static final String NORMAL = "normal";

    private Themen() {}

    private static String prefix(String packId) {
        if (packId == null) return null;
        for (String p : PREFIXE) if (packId.startsWith(p) && packId.length() > p.length()) return p;
        return null;
    }

    public static boolean istThema(String packId) {
        return prefix(packId) != null;
    }

    /** "file/Thema-Lila Nacht" -> "lilanacht", "file/Border-Rot.zip" -> "rot" */
    public static String schluessel(String packId) {
        String rest = packId.substring(prefix(packId).length());
        if (rest.toLowerCase(Locale.ROOT).endsWith(".zip")) {
            rest = rest.substring(0, rest.length() - 4);
        }
        return normalisiere(rest);
    }

    /** Kleinschreibung, Umlaute ausschreiben, Leer- und Trennzeichen weg. */
    public static String normalisiere(String text) {
        String s = text.toLowerCase(Locale.ROOT).trim()
                .replace("ä", "ae").replace("ö", "oe").replace("ü", "ue").replace("ß", "ss");
        StringBuilder b = new StringBuilder();
        for (char c : s.toCharArray()) {
            if ((c >= 'a' && c <= 'z') || (c >= '0' && c <= '9')) b.append(c);
        }
        return b.toString();
    }

    /** Alle Themen-Namen (sortiert) -> zugehoerige Paket-Id. */
    public static TreeMap<String, String> verfuegbar(Collection<String> paketIds) {
        TreeMap<String, String> out = new TreeMap<>();
        for (String id : paketIds) {
            if (istThema(id)) out.putIfAbsent(schluessel(id), id);
        }
        return out;
    }

    /** Sucht das Paket zu einer Eingabe wie "grün", "Gruen" oder "Lila Nacht". */
    public static Optional<String> finde(Collection<String> paketIds, String eingabe) {
        return Optional.ofNullable(verfuegbar(paketIds).get(normalisiere(eingabe)));
    }

    /** Name des gerade aktiven Themas oder "normal". */
    public static String aktiv(Collection<String> ausgewaehlt) {
        String treffer = NORMAL;
        for (String id : ausgewaehlt) {
            if (istThema(id)) treffer = schluessel(id); // das oberste (letzte) gewinnt
        }
        return treffer;
    }

    /**
     * Neue Paket-Auswahl: alle Themen raus, das Ziel (falls nicht "normal") ganz nach oben.
     * Andere Pakete des Nutzers bleiben unangetastet und in ihrer Reihenfolge.
     */
    public static List<String> neueAuswahl(Collection<String> ausgewaehlt, String zielPaketId) {
        List<String> neu = new ArrayList<>();
        for (String id : ausgewaehlt) {
            if (!istThema(id)) neu.add(id);
        }
        if (zielPaketId != null) neu.add(zielPaketId);
        return neu;
    }
}
