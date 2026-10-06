package me.meeshy.app;

import java.util.regex.Pattern;

/**
 * Les bornes du recepteur de fichiers (#9514) : une extension courte, sans
 * chemin, tiree du type du media ; et un plafond de taille, pour qu'une page
 * ne puisse pas remplir le stockage de l'appareil.
 */
final class FileSinkRules {

    static final long MAX_BYTES = 2L * 1024 * 1024 * 1024;

    private static final Pattern EXTENSION = Pattern.compile("[a-z0-9]{1,8}");

    private FileSinkRules() {}

    static boolean extensionAllowed(String extension) {
        return extension != null && EXTENSION.matcher(extension).matches();
    }

    static boolean fits(long written, int chunk) {
        return chunk >= 0 && written >= 0 && written + chunk <= MAX_BYTES;
    }
}
