package de.mctexturen.themenwechsel;

import com.mojang.brigadier.CommandDispatcher;
import com.mojang.brigadier.arguments.StringArgumentType;
import com.mojang.brigadier.context.CommandContext;
import net.fabricmc.api.ClientModInitializer;
import net.fabricmc.fabric.api.client.command.v2.ClientCommandRegistrationCallback;
import net.fabricmc.fabric.api.client.command.v2.ClientCommands;
import net.fabricmc.fabric.api.client.command.v2.FabricClientCommandSource;
import net.fabricmc.fabric.api.client.rendering.v1.LivingEntityRenderLayerRegistrationCallback;
import net.minecraft.ChatFormatting;
import net.minecraft.client.model.HumanoidModel;
import net.minecraft.client.renderer.entity.RenderLayerParent;
import net.minecraft.client.Minecraft;
import net.minecraft.commands.SharedSuggestionProvider;
import net.minecraft.network.chat.Component;
import net.minecraft.network.chat.MutableComponent;
import net.minecraft.server.packs.repository.PackRepository;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Optional;

/**
 * Client-Befehl zum Wechseln des Texturen-Themas:
 *   /thema            zeigt das aktive Thema und alle verfuegbaren
 *   /thema normal     alle Themen-Pakete aus (Minecraft-Originaltexturen)
 *   /thema <name>     Paket "Thema-<Name>" aus dem resourcepacks-Ordner aktivieren
 *                     (aeltere Pakete "Border-<Name>" gehen auch)
 */
public final class Themenwechsel implements ClientModInitializer {

    @Override
    @SuppressWarnings({"unchecked", "rawtypes"})
    public void onInitializeClient() {
        ClientCommandRegistrationCallback.EVENT.register((dispatcher, context) -> registriere(dispatcher));
        // Themen-Extras in 3D: breite Hutkrempe fuer Spieler, Ruestungsstaender, Zombies usw.
        LivingEntityRenderLayerRegistrationCallback.EVENT.register((type, renderer, helper, ctx) -> {
            if (renderer.getModel() instanceof HumanoidModel<?>) helper.register(new KrempenEbene((RenderLayerParent) renderer));
        });
    }

    private static void registriere(CommandDispatcher<FabricClientCommandSource> dispatcher) {
        dispatcher.register(ClientCommands.literal("thema")
                .executes(Themenwechsel::zeigeListe)
                .then(ClientCommands.literal("liste").executes(Themenwechsel::zeigeListe))
                .then(ClientCommands.argument("name", StringArgumentType.greedyString())
                        .suggests((ctx, builder) -> {
                            List<String> namen = new ArrayList<>();
                            namen.add(Themen.NORMAL);
                            namen.addAll(Themen.verfuegbar(paketIds()).keySet());
                            return SharedSuggestionProvider.suggest(namen, builder);
                        })
                        .executes(ctx -> wechsle(ctx, StringArgumentType.getString(ctx, "name")))));
    }

    /** Alle Pakete, die Minecraft gerade im resourcepacks-Ordner sieht (neu eingelesen). */
    private static List<String> paketIds() {
        PackRepository repo = Minecraft.getInstance().getResourcePackRepository();
        repo.reload(); // neue Themen aus dem Editor sofort finden
        return new ArrayList<>(repo.getAvailableIds());
    }

    private static int zeigeListe(CommandContext<FabricClientCommandSource> ctx) {
        PackRepository repo = Minecraft.getInstance().getResourcePackRepository();
        repo.reload();
        String aktiv = Themen.aktiv(repo.getSelectedIds());
        Map<String, String> themen = Themen.verfuegbar(repo.getAvailableIds());

        MutableComponent text = Component.literal("Texturen-Thema: ").withStyle(ChatFormatting.GRAY)
                .append(Component.literal(aktiv).withStyle(ChatFormatting.GREEN, ChatFormatting.BOLD));
        ctx.getSource().sendFeedback(text);

        MutableComponent liste = Component.literal("Verfügbar: ").withStyle(ChatFormatting.GRAY)
                .append(Component.literal(Themen.NORMAL).withStyle(ChatFormatting.WHITE));
        for (String name : themen.keySet()) {
            liste.append(Component.literal(", ").withStyle(ChatFormatting.GRAY))
                 .append(Component.literal(name).withStyle(ChatFormatting.GREEN));
        }
        ctx.getSource().sendFeedback(liste);
        ctx.getSource().sendFeedback(Component.literal("Wechseln mit /thema <name>").withStyle(ChatFormatting.DARK_GRAY));
        return 1;
    }

    private static int wechsle(CommandContext<FabricClientCommandSource> ctx, String eingabe) {
        Minecraft mc = Minecraft.getInstance();
        PackRepository repo = mc.getResourcePackRepository();
        repo.reload();

        String ziel = null;
        String anzeige = Themen.NORMAL;
        if (!Themen.normalisiere(eingabe).equals(Themen.NORMAL)) {
            Optional<String> paket = Themen.finde(repo.getAvailableIds(), eingabe);
            if (paket.isEmpty()) {
                ctx.getSource().sendError(Component.literal("Kein Thema \"" + eingabe + "\" gefunden. ")
                        .append(Component.literal("/thema").withStyle(ChatFormatting.YELLOW))
                        .append(" zeigt alle."));
                return 0;
            }
            ziel = paket.get();
            anzeige = Themen.schluessel(ziel);
        }

        if (Themen.aktiv(repo.getSelectedIds()).equals(anzeige)) {
            ctx.getSource().sendFeedback(Component.literal("Thema ").withStyle(ChatFormatting.GRAY)
                    .append(Component.literal(anzeige).withStyle(ChatFormatting.GREEN))
                    .append(Component.literal(" ist schon aktiv.").withStyle(ChatFormatting.GRAY)));
            return 1;
        }

        repo.setSelected(Themen.neueAuswahl(repo.getSelectedIds(), ziel));
        // Speichert options.txt und laedt die Texturen neu, wenn sich etwas geaendert hat.
        mc.options.updateResourcePacks(repo);

        ctx.getSource().sendFeedback(Component.literal("Thema gewechselt: ").withStyle(ChatFormatting.GRAY)
                .append(Component.literal(anzeige).withStyle(ChatFormatting.GREEN, ChatFormatting.BOLD))
                .append(Component.literal(" – Texturen werden neu geladen …").withStyle(ChatFormatting.GRAY)));
        return 1;
    }
}
