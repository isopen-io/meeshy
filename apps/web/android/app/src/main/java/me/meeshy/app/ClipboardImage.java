package me.meeshy.app;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;

/**
 * L'image du presse-papier que la coque rend a « Coller » (#8640). Pure et
 * testee sur la JVM seule ; {@link MeeshyClipboardPlugin} lit le presse-papier.
 *
 * Le plafond borne ce qui traverse le pont en base64 : une capture d'ecran
 * pleine resolution y tient, un fichier demesure n'y part pas. Le web reduit
 * ensuite l'image au carre du sticker avant tout envoi.
 */
final class ClipboardImage {

    static final int MAX_BYTES = 16 * 1024 * 1024;

    private ClipboardImage() {}

    static boolean isImage(String mimeType) {
        return mimeType != null && mimeType.startsWith("image/");
    }

    /** Le contenu entier, ou {@code null} s'il depasse {@code maxBytes}. */
    static byte[] readCapped(InputStream input, int maxBytes) throws IOException {
        ByteArrayOutputStream output = new ByteArrayOutputStream();
        byte[] buffer = new byte[8192];
        int read;
        while ((read = input.read(buffer)) != -1) {
            if (output.size() + read > maxBytes) return null;
            output.write(buffer, 0, read);
        }
        return output.toByteArray();
    }
}
