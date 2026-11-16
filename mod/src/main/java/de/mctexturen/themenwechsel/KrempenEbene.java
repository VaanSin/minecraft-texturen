package de.mctexturen.themenwechsel;

import com.mojang.blaze3d.vertex.PoseStack;
import net.minecraft.client.Minecraft;
import net.minecraft.client.model.HumanoidModel;
import net.minecraft.client.model.geom.ModelPart;
import net.minecraft.client.model.geom.PartPose;
import net.minecraft.client.model.geom.builders.CubeListBuilder;
import net.minecraft.client.model.geom.builders.LayerDefinition;
import net.minecraft.client.model.geom.builders.MeshDefinition;
import net.minecraft.client.renderer.SubmitNodeCollector;
import net.minecraft.client.renderer.entity.RenderLayerParent;
import net.minecraft.client.renderer.entity.layers.RenderLayer;
import net.minecraft.client.renderer.entity.state.HumanoidRenderState;
import net.minecraft.client.renderer.rendertype.RenderTypes;
import net.minecraft.client.renderer.texture.OverlayTexture;
import net.minecraft.core.component.DataComponents;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.resources.Identifier;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.equipment.Equippable;

import java.util.HashMap;
import java.util.Map;
import java.util.Optional;

/**
 * Zeichnet eine breite, flache Hutkrempe auf den Kopf - aber nur, wenn das aktive Texturen-Thema
 * dafuer ein Bild mitbringt:  assets/minecraft/textures/entity/equipment/krempe/<material>.png
 * (z. B. krempe/copper.png fuer den Kupferhelm). Ohne Bild (z. B. /thema normal) passiert nichts.
 *
 * Die Krempe ist ein 16 x 1 x 16 Pixel grosser flacher Quader auf Hoehe der Hutkrempe. Das Bild ist
 * 64 x 32 gross (Minecraft-Box-Layout): Oberseite bei (16,0), Unterseite bei (32,0), je 16 x 16.
 */
public final class KrempenEbene<S extends HumanoidRenderState, M extends HumanoidModel<S>> extends RenderLayer<S, M> {
    static final String ORDNER = "textures/entity/equipment/krempe/";
    private static final ModelPart KREMPE = baue();
    private static final Map<String, Optional<Identifier>> CACHE = new HashMap<>();
    private static long cacheZeit;
    private static boolean abgeschaltet;

    public KrempenEbene(RenderLayerParent<S, M> parent) {
        super(parent);
    }

    private static ModelPart baue() {
        MeshDefinition mesh = new MeshDefinition();
        // Kopf geht von y=-8 (oben) bis 0; die Hutkrempe der Ruestung liegt etwa bei -5.4 bis -4.0
        mesh.getRoot().addOrReplaceChild("krempe",
                CubeListBuilder.create().texOffs(0, 0).addBox(-8.0F, -5.0F, -8.0F, 16.0F, 1.0F, 16.0F),
                PartPose.ZERO);
        return LayerDefinition.create(mesh, 64, 32).bakeRoot().getChild("krempe");
    }

    @Override
    public void submit(PoseStack pose, SubmitNodeCollector collector, int light, S state, float yRot, float xRot) {
        if (abgeschaltet) return;
        try {
            ItemStack kopf = state.headEquipment;
            if (kopf == null || kopf.isEmpty()) return;
            Identifier textur = textur(kopf);
            if (textur == null) return;
            pose.pushPose();
            getParentModel().getHead().translateAndRotate(pose);
            collector.submitModelPart(KREMPE, pose, RenderTypes.armorCutoutNoCull(textur), light, OverlayTexture.NO_OVERLAY, null);
            pose.popPose();
        } catch (Throwable t) {
            // Lieber keine Krempe als ein abgestuerztes Spiel
            abgeschaltet = true;
            System.err.println("[Themenwechsel] Krempe abgeschaltet: " + t);
        }
    }

    /** Krempen-Bild fuer diesen Helm, falls das aktive Thema eins hat (alle 2 Sekunden neu geprueft). */
    private static Identifier textur(ItemStack stack) {
        long jetzt = System.currentTimeMillis();
        if (jetzt - cacheZeit > 2000) {
            CACHE.clear();
            cacheZeit = jetzt;
        }
        String material = material(stack);
        return CACHE.computeIfAbsent(material, m -> {
            Identifier id = Identifier.withDefaultNamespace(ORDNER + m + ".png");
            return Minecraft.getInstance().getResourceManager().getResource(id).isPresent() ? Optional.of(id) : Optional.empty();
        }).orElse(null);
    }

    /** "copper" fuer den Kupferhelm: Ausruestungs-Material, sonst der Item-Name. */
    static String material(ItemStack stack) {
        Equippable eq = stack.get(DataComponents.EQUIPPABLE);
        if (eq != null && eq.assetId().isPresent()) return eq.assetId().get().identifier().getPath();
        return BuiltInRegistries.ITEM.getKey(stack.getItem()).getPath();
    }
}
