package me.meeshy.app;

import java.util.Locale;

/**
 * #10087 — Chrome Android ouvre le selecteur de photos du systeme pour une
 * entree qui n'accepte que des photos et/ou des videos ; Capacitor ouvre
 * l'explorateur de fichiers. Le selecteur est garanti a partir de l'API 33 ;
 * `capture` garde l'appareil photo, et un type precis, une extension ou une
 * autre famille gardent l'explorateur, qui seul sait filtrer.
 */
public final class PhotoPickRules {

    static final int PHOTO_PICKER_SDK = 33;
    static final String IMAGES = "image/*";
    static final String VIDEOS = "video/*";
    static final String BOTH = "*/*";

    private PhotoPickRules() {}

    public static String pickerType(int sdk, String[] accept, boolean capture) {
        if (sdk < PHOTO_PICKER_SDK || capture || accept == null) return null;
        boolean images = false;
        boolean videos = false;
        for (String raw : accept) {
            String type = raw == null ? "" : raw.trim().toLowerCase(Locale.ROOT);
            if (type.isEmpty()) continue;
            if (IMAGES.equals(type)) images = true;
            else if (VIDEOS.equals(type)) videos = true;
            else return null;
        }
        if (images && videos) return BOTH;
        if (images) return IMAGES;
        return videos ? VIDEOS : null;
    }
}
