// Startprogramm "Minecraft Texturen.exe": startet den kleinen Server (mitgeliefertes Node) ohne Konsolenfenster.
// Der Server oeffnet das Programmfenster und beendet sich, wenn es geschlossen wird.
// Gebaut von tools/paket.mjs mit dem csc.exe aus Windows (.NET Framework 4).
using System;
using System.Diagnostics;
using System.IO;
using System.Windows.Forms;

static class Starter {
    [STAThread]
    static void Main() {
        string here = AppDomain.CurrentDomain.BaseDirectory;
        string app = Path.Combine(here, "app");
        string node = Path.Combine(app, "node", "node.exe");
        string server = Path.Combine(app, "server.mjs");
        if (!File.Exists(node) || !File.Exists(server)) {
            MessageBox.Show("Der Ordner \"app\" fehlt oder ist unvollständig.\n\nBitte die ZIP-Datei komplett entpacken und \"Minecraft Texturen.exe\" darin starten.",
                "Minecraft Texturen", MessageBoxButtons.OK, MessageBoxIcon.Error);
            return;
        }
        var psi = new ProcessStartInfo(node, "--no-warnings \"" + server + "\" --app") {
            WorkingDirectory = app,
            UseShellExecute = false,
            CreateNoWindow = true,
        };
        try { Process.Start(psi); }
        catch (Exception e) {
            MessageBox.Show("Start fehlgeschlagen: " + e.Message, "Minecraft Texturen", MessageBoxButtons.OK, MessageBoxIcon.Error);
        }
    }
}
