package me.meeshy.app;

import java.io.File;
import java.io.IOException;
import java.util.regex.Pattern;

/**
 * Les bornes du recepteur de fichiers (#9514) : une extension courte, sans
 * chemin, tiree du type du media ; et un plafond de taille, pour qu'une page
 * ne puisse pas remplir le stockage de l'appareil. Et `shareFileAt` (#9553)
 * ne partage qu'un fichier existant, pose directement dans le dossier du
 * recepteur : jamais un autre fichier de l'app, quel que soit le chemin recu.
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

    static boolean insideSink(File sinkDirectory, File candidate) {
        if (sinkDirectory == null || candidate == null || !candidate.isFile()) return false;
        try {
            File parent = candidate.getCanonicalFile().getParentFile();
            return parent != null && parent.equals(sinkDirectory.getCanonicalFile());
        } catch (IOException error) {
            return false;
        }
    }
}
