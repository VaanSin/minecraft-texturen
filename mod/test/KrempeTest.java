import de.mctexturen.themenwechsel.KrempenEbene;

import java.lang.reflect.Field;

/**
 * Prueft ohne Spielfenster, dass sich das Krempen-Modellteil mit dem echten Spielcode bauen laesst.
 * (Item-Stacks brauchen eine geladene Welt - die Zuordnung Helm -> Material laesst sich hier nicht pruefen.)
 */
public class KrempeTest {
    public static void main(String[] args) throws Exception {
        net.minecraft.SharedConstants.tryDetectVersion();
        net.minecraft.server.Bootstrap.bootStrap();
        Field f = KrempenEbene.class.getDeclaredField("KREMPE");
        f.setAccessible(true);
        Object teil = f.get(null);
        System.out.println((teil != null ? "  ok     " : "  FEHLER ") + "Krempen-Modellteil gebaut");
        System.exit(teil != null ? 0 : 1);
    }
}
