import de.mctexturen.themenwechsel.Themen;

import java.util.List;

/** Prueft die Themen-Logik ohne Minecraft. Aufruf ueber test.ps1. */
public class ThemenTest {
    static int fehler = 0;

    static void pruefe(String was, Object ist, Object soll) {
        boolean ok = soll == null ? ist == null : soll.equals(ist);
        System.out.println((ok ? "  ok    " : "  FEHLER ") + was + (ok ? "" : "  ist=" + ist + "  soll=" + soll));
        if (!ok) fehler++;
    }

    public static void main(String[] args) {
        List<String> verfuegbar = List.of("vanilla", "fabric", "file/Border-Gruen", "file/Border-Rot.zip",
                "file/FreshAnimations_v1.10.5.zip", "file/Border-", "file/Border-Lila Nacht", "file/Thema-Wald Blau", "file/Thema-");

        pruefe("Gruen ist Thema", Themen.istThema("file/Border-Gruen"), true);
        pruefe("leerer Name ist kein Thema", Themen.istThema("file/Border-"), false);
        pruefe("neues Thema- ist Thema", Themen.istThema("file/Thema-Wald Blau"), true);
        pruefe("leeres Thema- ist kein Thema", Themen.istThema("file/Thema-"), false);
        pruefe("Schluessel Thema-", Themen.schluessel("file/Thema-Wald Blau"), "waldblau");
        pruefe("anderes Paket ist kein Thema", Themen.istThema("file/FreshAnimations_v1.10.5.zip"), false);
        pruefe("Schluessel Gruen", Themen.schluessel("file/Border-Gruen"), "gruen");
        pruefe("Schluessel Zip", Themen.schluessel("file/Border-Rot.zip"), "rot");
        pruefe("Schluessel mit Leerzeichen", Themen.schluessel("file/Border-Lila Nacht"), "lilanacht");
        pruefe("Liste", Themen.verfuegbar(verfuegbar).keySet().toString(), "[gruen, lilanacht, rot, waldblau]");
        pruefe("grün mit Umlaut", Themen.finde(verfuegbar, "grün").orElse(null), "file/Border-Gruen");
        pruefe("GRUEN gross", Themen.finde(verfuegbar, "GRUEN").orElse(null), "file/Border-Gruen");
        pruefe("Wald Blau mit Leerzeichen", Themen.finde(verfuegbar, "Wald Blau").orElse(null), "file/Thema-Wald Blau");
        pruefe("unbekannt", Themen.finde(verfuegbar, "blau").orElse(null), null);

        List<String> auswahl = List.of("vanilla", "fabric", "file/FreshAnimations_v1.10.5.zip", "file/Border-Gruen");
        pruefe("aktiv", Themen.aktiv(auswahl), "gruen");
        pruefe("aktiv ohne Thema", Themen.aktiv(List.of("vanilla")), "normal");
        pruefe("auf rot", Themen.neueAuswahl(auswahl, "file/Border-Rot.zip").toString(),
                "[vanilla, fabric, file/FreshAnimations_v1.10.5.zip, file/Border-Rot.zip]");
        pruefe("von Border auf Thema-", Themen.neueAuswahl(auswahl, "file/Thema-Wald Blau").toString(),
                "[vanilla, fabric, file/FreshAnimations_v1.10.5.zip, file/Thema-Wald Blau]");
        pruefe("auf normal", Themen.neueAuswahl(auswahl, null).toString(),
                "[vanilla, fabric, file/FreshAnimations_v1.10.5.zip]");

        System.out.println(fehler == 0 ? "Alle Tests bestanden." : fehler + " Test(s) fehlgeschlagen.");
        System.exit(fehler == 0 ? 0 : 1);
    }
}
