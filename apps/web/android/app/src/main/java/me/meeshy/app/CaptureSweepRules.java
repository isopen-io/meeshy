package me.meeshy.app;

import java.io.File;
import java.util.regex.Pattern;

/**
 * #12744 — Capacitor range chaque prise d'un `<input capture>` dans
 * `getExternalFilesDir(Pictures)` (`BridgeWebChromeClient.createImageFile`,
 * `JPEG_<horodatage>_*.jpg`) et ne la supprime jamais ; Chrome nettoie les
 * siennes. Une nouvelle activite porte une nouvelle WebView, qui ne tient plus
 * de reference vers les prises de la precedente : la creation balaie celles qui
 * ont plus de {@link #MAX_AGE_MS}. Une prise recente, en cours ou deja remise a
 * la page, n'est jamais touchee, ni aucun autre fichier du dossier.
 */
final class CaptureSweepRules {

    static final long MAX_AGE_MS = 60L * 60 * 1000;

    private static final Pattern CAPTURE = Pattern.compile("JPEG_\\d{8}_\\d{6}_.*\\.jpg");

    private CaptureSweepRules() {}

    static boolean isStaleCapture(String name, long lastModified, long now) {
        return name != null && CAPTURE.matcher(name).matches() && now - lastModified >= MAX_AGE_MS;
    }

    static void sweep(File pictures, long now) {
        File[] entries = pictures == null ? null : pictures.listFiles();
        if (entries == null) return;
        for (File entry : entries) {
            if (entry.isFile() && isStaleCapture(entry.getName(), entry.lastModified(), now)) entry.delete();
        }
    }
}
