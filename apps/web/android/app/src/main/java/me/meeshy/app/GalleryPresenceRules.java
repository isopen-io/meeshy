package me.meeshy.app;

import java.io.File;
import java.io.IOException;

/**
 * La borne de `MeeshyGallery.exists` (#14654) : la page ne demande la presence
 * que d'un fichier sous le dossier des albums (`getExternalMediaDirs()[0]`, la
 * ou `savePhoto`/`saveVideo` du plugin `Media` ecrivent), qu'il existe encore
 * ou non. Tout autre chemin est refuse : la page ne sonde pas le stockage.
 */
final class GalleryPresenceRules {

    private GalleryPresenceRules() {}

    static boolean insideAlbums(File albumsRoot, File candidate) {
        if (albumsRoot == null || candidate == null) return false;
        try {
            File root = albumsRoot.getCanonicalFile();
            for (File parent = candidate.getCanonicalFile().getParentFile(); parent != null; parent = parent.getParentFile()) {
                if (parent.equals(root)) return true;
            }
            return false;
        } catch (IOException error) {
            return false;
        }
    }
}
