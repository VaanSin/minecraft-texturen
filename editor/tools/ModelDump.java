import net.minecraft.client.model.geom.LayerDefinitions;
import net.minecraft.client.model.geom.ModelLayerLocation;
import net.minecraft.client.model.geom.ModelPart;
import net.minecraft.client.model.geom.builders.LayerDefinition;

import java.io.Writer;
import java.lang.reflect.Field;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.TreeMap;

/**
 * Schreibt alle Entity-Modelle von Minecraft als JSON - direkt aus dem Spielcode,
 * damit die 3D-Ansicht im Texturen-Editor exakt wie im Spiel aussieht.
 *
 * Pro Modell: Texturgroesse und ein Baum aus Teilen (Position, Drehung, Skalierung)
 * mit fertigen Vierecken [x,y,z,u,v] x 4 (u/v schon auf 0..1 normiert).
 */
public class ModelDump {
    public static void main(String[] args) throws Exception {
        Path out = Path.of(args[0]);
        net.minecraft.SharedConstants.tryDetectVersion();
        net.minecraft.server.Bootstrap.bootStrap();
        Map<ModelLayerLocation, LayerDefinition> roots = LayerDefinitions.createRoots();
        TreeMap<String, LayerDefinition> sorted = new TreeMap<>();
        for (Map.Entry<ModelLayerLocation, LayerDefinition> e : roots.entrySet()) {
            sorted.put(e.getKey().model().toString() + "#" + e.getKey().layer(), e.getValue());
        }
        Field cubesF = ModelPart.class.getDeclaredField("cubes");
        Field childrenF = ModelPart.class.getDeclaredField("children");
        cubesF.setAccessible(true);
        childrenF.setAccessible(true);

        StringBuilder sb = new StringBuilder(1 << 22);
        sb.append("{\"version\":1,\"models\":{");
        int ok = 0, failed = 0;
        boolean first = true;
        for (Map.Entry<String, LayerDefinition> e : sorted.entrySet()) {
            try {
                int[] size = textureSize(e.getValue());
                ModelPart root = e.getValue().bakeRoot();
                StringBuilder one = new StringBuilder();
                one.append('"').append(e.getKey()).append("\":{\"tw\":").append(size[0]).append(",\"th\":").append(size[1]).append(",\"root\":");
                part(one, root, cubesF, childrenF);
                one.append('}');
                if (!first) sb.append(',');
                sb.append(one);
                first = false;
                ok++;
            } catch (Throwable t) {
                failed++;
                System.err.println("uebersprungen: " + e.getKey() + " (" + t + ")");
            }
        }
        sb.append("}}");
        try (Writer w = Files.newBufferedWriter(out, StandardCharsets.UTF_8)) {
            w.write(sb.toString());
        }
        System.out.println(ok + " Modelle geschrieben, " + failed + " uebersprungen -> " + out);
    }

    /** Texturgroesse steckt privat in LayerDefinition -> MaterialDefinition. */
    static int[] textureSize(LayerDefinition def) throws Exception {
        for (Field f : LayerDefinition.class.getDeclaredFields()) {
            f.setAccessible(true);
            Object mat = f.get(def);
            if (mat == null || mat.getClass().getName().endsWith("MeshDefinition")) continue;
            int w = -1, h = -1;
            for (Field g : mat.getClass().getDeclaredFields()) {
                if (g.getType() != int.class) continue;
                g.setAccessible(true);
                String n = g.getName().toLowerCase(Locale.ROOT);
                if (n.startsWith("x")) w = g.getInt(mat);
                if (n.startsWith("y")) h = g.getInt(mat);
            }
            if (w > 0 && h > 0) return new int[]{w, h};
        }
        return new int[]{64, 64};
    }

    @SuppressWarnings("unchecked")
    static void part(StringBuilder sb, ModelPart p, Field cubesF, Field childrenF) throws Exception {
        sb.append("{\"p\":[").append(n(p.x)).append(',').append(n(p.y)).append(',').append(n(p.z)).append(']');
        if (p.xRot != 0 || p.yRot != 0 || p.zRot != 0) {
            sb.append(",\"r\":[").append(n(p.xRot)).append(',').append(n(p.yRot)).append(',').append(n(p.zRot)).append(']');
        }
        if (p.xScale != 1 || p.yScale != 1 || p.zScale != 1) {
            sb.append(",\"s\":[").append(n(p.xScale)).append(',').append(n(p.yScale)).append(',').append(n(p.zScale)).append(']');
        }
        if (!p.visible) sb.append(",\"hidden\":true");
        List<ModelPart.Cube> cubes = (List<ModelPart.Cube>) cubesF.get(p);
        if (!cubes.isEmpty()) {
            sb.append(",\"q\":[");
            boolean firstQ = true;
            for (ModelPart.Cube c : cubes) {
                for (ModelPart.Polygon poly : c.polygons) {
                    if (poly == null) continue;
                    if (!firstQ) sb.append(',');
                    firstQ = false;
                    sb.append('[');
                    ModelPart.Vertex[] vs = poly.vertices();
                    for (int i = 0; i < vs.length; i++) {
                        ModelPart.Vertex v = vs[i];
                        if (i > 0) sb.append(',');
                        sb.append(n(v.x())).append(',').append(n(v.y())).append(',').append(n(v.z()))
                          .append(',').append(n(v.u())).append(',').append(n(v.v()));
                    }
                    sb.append(']');
                }
            }
            sb.append(']');
        }
        Map<String, ModelPart> children = (Map<String, ModelPart>) childrenF.get(p);
        if (!children.isEmpty()) {
            sb.append(",\"c\":{");
            boolean firstC = true;
            for (Map.Entry<String, ModelPart> ch : children.entrySet()) {
                if (!firstC) sb.append(',');
                firstC = false;
                sb.append('"').append(ch.getKey()).append("\":");
                part(sb, ch.getValue(), cubesF, childrenF);
            }
            sb.append('}');
        }
        sb.append('}');
    }

    static String n(float f) {
        if (!Float.isFinite(f)) return "0"; // entartete Flaechen (Breite 0) liefern NaN
        if (f == Math.rint(f)) return Integer.toString((int) f);
        String s = String.format(Locale.ROOT, "%.5f", f);
        s = s.replaceAll("0+$", "");
        return s.endsWith(".") ? s.substring(0, s.length() - 1) : s;
    }
}
