package me.meeshy.app;

import java.net.URI;
import java.net.URISyntaxException;
import java.util.Locale;
import java.util.regex.Pattern;

/**
 * Ce que la carte de lecture accepte de telecharger pour son image (#10624,
 * revue de securite) — la meme garde que celle des visages de widget
 * (`WidgetAvatarRules`, #10626), a fusionner avec elle : seulement les hotes
 * media Meeshy (`meeshy.me` et ses sous-domaines) en HTTPS, aucune IP
 * litterale, la passerelle locale (`localhost`, `10.0.2.2`) en HTTP pour un
 * build de developpement seul ; une redirection revalidee, au plus deux ; un
 * plafond d'octets, un `Content-Length` annonce au-dela refuse d'emblee ; une
 * image refusee sur ses dimensions avant decodage.
 */
final class PlaybackArtworkRules {

    static final int MAX_REDIRECTS = 2;
    static final int MAX_BYTES = 2 * 1024 * 1024;
    static final int MAX_SIDE_PX = 4096;
    static final long MAX_PIXELS = 16_000_000L;

    private static final String MEDIA_DOMAIN = "meeshy.me";
    private static final Pattern IPV4 = Pattern.compile("^\\d{1,3}(\\.\\d{1,3}){3}$");

    private PlaybackArtworkRules() {}

    static boolean isFetchable(String url, boolean debug) {
        if (url == null) return false;
        try {
            return isFetchable(new URI(url), debug);
        } catch (URISyntaxException unreadable) {
            return false;
        }
    }

    private static boolean isFetchable(URI uri, boolean debug) {
        String scheme = uri.getScheme();
        String host = uri.getHost();
        if (scheme == null || host == null || uri.getRawUserInfo() != null) return false;
        String h = host.toLowerCase(Locale.ROOT);
        if (debug && "http".equals(scheme) && ("localhost".equals(h) || "10.0.2.2".equals(h))) return true;
        if (!"https".equals(scheme) || h.startsWith("[") || h.indexOf(':') >= 0 || IPV4.matcher(h).matches()) return false;
        return h.equals(MEDIA_DOMAIN) || h.endsWith("." + MEDIA_DOMAIN);
    }

    /** L'adresse d'une redirection, resolue contre la requete, ou `null` si la garde la refuse. */
    static String redirectTarget(String from, String location, boolean debug) {
        if (from == null || location == null) return null;
        try {
            URI target = new URI(from).resolve(location);
            return isFetchable(target, debug) ? target.toString() : null;
        } catch (URISyntaxException | IllegalArgumentException unreadable) {
            return null;
        }
    }

    /** Inconnu (-1), on lit sous plafond. */
    static boolean acceptsLength(long length) {
        return length <= MAX_BYTES;
    }

    static boolean acceptsDimensions(int width, int height) {
        if (width <= 0 || height <= 0 || width > MAX_SIDE_PX || height > MAX_SIDE_PX) return false;
        return (long) width * height <= MAX_PIXELS;
    }

    /** La plus petite puissance de deux qui ramene le PLUS GRAND cote sous 2 × l'image rendue. */
    static int sampleSize(int width, int height, int sidePx) {
        int largest = Math.max(width, height);
        int limit = Math.max(1, 2 * sidePx);
        int sample = 1;
        while (largest / sample > limit) sample *= 2;
        return sample;
    }
}
