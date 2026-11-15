package me.meeshy.app;

import java.util.Locale;
import java.util.function.Function;

/**
 * #10087 — Chrome Android ouvre le selecteur de photos du systeme pour une
 * entree qui n'accepte que des photos et/ou des videos ; Capacitor ouvre
 * l'explorateur de fichiers. Le selecteur est garanti a partir de l'API 33 ;
 * `capture` garde l'appareil photo, et une extension ou une autre famille
 * gardent l'explorateur, qui seul sait filtrer.
 *
 * #10209 — comme Chromium, un type precis (`image/png`) compte pour sa
 * famille : la photo de profil et les images d'un pack d'autocollants
 * s'ouvrent aussi dans la galerie. Un type unique y filtre exactement.
 *
 * #12677 — comme Chromium (`ensureMimeType`), une extension compte pour le
 * type que le systeme lui connait : la tuile « Image » d'un invite
 * (`.jpg,…,image/jpeg,…`) ouvre la galerie. Une extension inconnue, ou d'une
 * autre famille, garde l'explorateur.
 */
public final class PhotoPickRules {

    static final int PHOTO_PICKER_SDK = 33;
    static final String IMAGES = "image/*";
    static final String VIDEOS = "video/*";
    static final String BOTH = "*/*";

    private PhotoPickRules() {}

    public static String pickerType(int sdk, String[] accept, boolean capture) {
        return pickerType(sdk, accept, capture, extension -> null);
    }

    public static String pickerType(int sdk, String[] accept, boolean capture, Function<String, String> mimeTypeOfExtension) {
        if (sdk < PHOTO_PICKER_SDK || capture || accept == null) return null;
        boolean images = false;
        boolean videos = false;
        String single = null;
        boolean several = false;
        for (String raw : accept) {
            String type = typeOf(raw, mimeTypeOfExtension);
            if (type == null) return null;
            if (type.isEmpty()) continue;
            if (isOf("image/", type)) images = true;
            else if (isOf("video/", type)) videos = true;
            else return null;
            if (single == null) single = type;
            else if (!single.equals(type)) several = true;
        }
        if (images && videos) return BOTH;
        if (single != null && !several) return single;
        if (images) return IMAGES;
        return videos ? VIDEOS : null;
    }

    /** Le type d'une entree, `""` si elle est vide, `null` pour une extension que le systeme ne connait pas. */
    private static String typeOf(String raw, Function<String, String> mimeTypeOfExtension) {
        String entry = raw == null ? "" : raw.trim().toLowerCase(Locale.ROOT);
        if (!entry.startsWith(".")) return entry;
        String type = entry.length() > 1 ? mimeTypeOfExtension.apply(entry.substring(1)) : null;
        return type == null || type.trim().isEmpty() ? null : type.trim().toLowerCase(Locale.ROOT);
    }

    private static boolean isOf(String family, String type) {
        return type.startsWith(family) && type.length() > family.length();
    }
}
