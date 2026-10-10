package me.meeshy.app;

import java.util.Locale;

/**
 * Ce que la coque accepte quand une autre application partage a Meeshy (#8884).
 * Pure et testee sur la JVM seule ; {@link MeeshyShareIntentPlugin} lit l'intent
 * et copie les contenus.
 *
 * Les plafonds bornent ce qui traverse le pont : un partage vient d'un tiers,
 * et les memes bornes gardent le service worker de la PWA
 * ({@code public/sw-share-target.js} : dix fichiers, 100 Mo).
 */
final class ShareIntentRules {

    static final int MAX_FILES = 10;
    static final long MAX_TOTAL_BYTES = 100L * 1024 * 1024;
    static final int MAX_TEXT_CHARS = 20_000;
    static final int MAX_NAME_CHARS = 100;

    // Les valeurs de Intent.ACTION_SEND / ACTION_SEND_MULTIPLE : la classe reste
    // pure (aucun import Android), compilable et testee sur la JVM seule.
    static final String ACTION_SEND = "android.intent.action.SEND";
    static final String ACTION_SEND_MULTIPLE = "android.intent.action.SEND_MULTIPLE";

    private ShareIntentRules() {}

    static boolean isShareAction(String action) {
        return ACTION_SEND.equals(action) || ACTION_SEND_MULTIPLE.equals(action);
    }

    /** Les types que la feuille d'envoi sait envoyer — {@code AndroidManifest.xml} declare les memes. */
    static boolean isAcceptedMime(String mimeType) {
        return mimeType != null && (mimeType.startsWith("image/") || mimeType.startsWith("video/"));
    }

    /**
     * Seul le contenu d'une AUTRE application se lit. Un {@code file://} ou une
     * URI de notre propre fournisseur ({@code me.meeshy.app.fileprovider})
     * ferait lire a la coque ses fichiers PRIVES (jeton, base, preferences) au
     * nom du tiers qui a forge l'intent, puis les proposerait a l'envoi.
     */
    static boolean isForeignContent(String scheme, String authority, String ownPackage) {
        if (scheme == null || !"content".equals(scheme.toLowerCase(Locale.ROOT)) || authority == null || authority.isEmpty()) {
            return false;
        }
        return !(authority.equals(ownPackage) || authority.startsWith(ownPackage + "."));
    }

    /**
     * Un nom sans chemin ni caractere dangereux, jamais vide. Le nom vient du
     * fournisseur de l'autre application : il ne sort pas du dossier des
     * temporaires ({@code ../}) et ne commence pas par un point.
     */
    static String fileNameFor(String displayName, String mimeType, int index) {
        String base = displayName == null ? "" : displayName;
        int slash = Math.max(base.lastIndexOf('/'), base.lastIndexOf('\\'));
        String cleaned = base
            .substring(slash + 1)
            .replaceAll("[^\\p{L}\\p{N}._ -]", "_")
            .replaceAll("^[.\\s]+", "")
            .trim();
        if (cleaned.length() > MAX_NAME_CHARS) {
            cleaned = cleaned.substring(0, MAX_NAME_CHARS);
        }
        if (cleaned.isEmpty()) {
            return "partage-" + (index + 1) + extensionFor(mimeType);
        }
        return cleaned;
    }

    private static String extensionFor(String mimeType) {
        if (mimeType == null) {
            return "";
        }
        int slash = mimeType.indexOf('/');
        if (slash < 0 || slash == mimeType.length() - 1) {
            return "";
        }
        String subtype = mimeType.substring(slash + 1).toLowerCase(Locale.ROOT);
        if (subtype.equals("jpeg")) {
            return ".jpg";
        }
        if (subtype.equals("*") || !subtype.matches("[a-z0-9]{1,5}")) {
            return "";
        }
        return "." + subtype;
    }

    /** Ce qu'il reste de budget apres {@code used} octets copies — jamais negatif. */
    static long remainingBytes(long used) {
        return Math.max(0L, MAX_TOTAL_BYTES - used);
    }

    /** Le texte partage, borne ; {@code ""} quand il n'y en a pas. */
    static String boundedText(CharSequence text) {
        if (text == null) {
            return "";
        }
        String value = text.toString();
        return value.length() > MAX_TEXT_CHARS ? value.substring(0, MAX_TEXT_CHARS) : value;
    }
}
