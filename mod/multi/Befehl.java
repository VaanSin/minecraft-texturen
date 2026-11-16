package de.mctexturen.themenwechsel;

import com.mojang.brigadier.arguments.StringArgumentType;
import com.mojang.brigadier.builder.LiteralArgumentBuilder;
import com.mojang.brigadier.builder.RequiredArgumentBuilder;

import java.util.ArrayList;
import java.util.Collection;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.function.BiConsumer;

/**
 * Der Befehl /thema - ohne Minecraft-Klassen, nur mit Brigadier.
 * Dadurch ist er fuer Forge, NeoForge und Fabric in jeder Version gleich;
 * den Zugriff aufs Spiel liefert die Klasse Spiel, die beim Bauen pro Version erzeugt wird.
 */
public final class Befehl {
    public interface Spiel {
        Collection<String> verfuegbar();
        Collection<String> ausgewaehlt();
        void setze(List<String> paketIds);
    }

    private Befehl() {}

    public static <S> LiteralArgumentBuilder<S> baue(Spiel spiel, BiConsumer<S, String> sende) {
        return LiteralArgumentBuilder.<S>literal("thema")
                .executes(ctx -> liste(spiel, ctx.getSource(), sende))
                .then(LiteralArgumentBuilder.<S>literal("liste").executes(ctx -> liste(spiel, ctx.getSource(), sende)))
                .then(RequiredArgumentBuilder.<S, String>argument("name", StringArgumentType.greedyString())
                        .suggests((ctx, builder) -> {
                            String rest = builder.getRemaining().toLowerCase(Locale.ROOT);
                            List<String> namen = new ArrayList<>();
                            namen.add(Themen.NORMAL);
                            namen.addAll(Themen.verfuegbar(spiel.verfuegbar()).keySet());
                            for (String n : namen) if (n.startsWith(rest)) builder.suggest(n);
                            return builder.buildFuture();
                        })
                        .executes(ctx -> wechsle(spiel, ctx.getSource(), sende, StringArgumentType.getString(ctx, "name"))));
    }

    private static <S> int liste(Spiel spiel, S quelle, BiConsumer<S, String> sende) {
        Collection<String> alle = spiel.verfuegbar();
        String aktiv = Themen.aktiv(spiel.ausgewaehlt());
        Map<String, String> themen = Themen.verfuegbar(alle);
        sende.accept(quelle, "§7Texturen-Thema: §a§l" + aktiv);
        StringBuilder b = new StringBuilder("§7Verfügbar: §f" + Themen.NORMAL);
        for (String name : themen.keySet()) b.append("§7, §a").append(name);
        sende.accept(quelle, b.toString());
        sende.accept(quelle, "§8Wechseln mit /thema <name>");
        return 1;
    }

    private static <S> int wechsle(Spiel spiel, S quelle, BiConsumer<S, String> sende, String eingabe) {
        Collection<String> alle = spiel.verfuegbar();
        String ziel = null;
        String anzeige = Themen.NORMAL;
        if (!Themen.normalisiere(eingabe).equals(Themen.NORMAL)) {
            Optional<String> paket = Themen.finde(alle, eingabe);
            if (paket.isEmpty()) {
                sende.accept(quelle, "§cKein Thema \"" + eingabe + "\" gefunden. §e/thema§c zeigt alle.");
                return 0;
            }
            ziel = paket.get();
            anzeige = Themen.schluessel(ziel);
        }
        Collection<String> jetzt = spiel.ausgewaehlt();
        if (Themen.aktiv(jetzt).equals(anzeige)) {
            sende.accept(quelle, "§7Thema §a" + anzeige + "§7 ist schon aktiv.");
            return 1;
        }
        spiel.setze(Themen.neueAuswahl(jetzt, ziel));
        sende.accept(quelle, "§7Thema gewechselt: §a§l" + anzeige + "§r§7 – Texturen werden neu geladen …");
        return 1;
    }
}
