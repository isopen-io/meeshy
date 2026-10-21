package me.meeshy.app;

import java.net.URI;
import java.net.URISyntaxException;
import java.util.Locale;
import java.util.regex.Pattern;

/**
 * #10626 (revue de securite) — ce que le natif accepte de telecharger pour
 * peindre un visage de widget. La page publie des adresses resolues par
 * `attachmentSrc` (`src/lib/api/media-url.ts`) : en production et en staging
 * elles pointent toutes sur `meeshy.me` ou l'un de ses sous-domaines
 * (`static.`, `gate.`, `gate.staging.`). Rien d'autre ne part : ni un hote
 * tiers (SSRF depuis l'appareil), ni du HTTP en clair, ni une IP litterale —
 * sauf la passerelle locale d'un build de developpement (Vite sur
 * `localhost`, l'hote vu de l'emulateur `10.0.2.2`). Une redirection est
 * revalidee par la MEME garde, au plus deux fois. Et une image est refusee
 * sur ses dimensions avant d'etre decodee : quelques Ko compresses peuvent
 * se decoder en centaines de Mo.
 */
final class WidgetAvatarRules {

    static final int MAX_REDIRECTS = 2;
    static final int MAX_BYTES = 2 * 1024 * 1024;
    static final int MAX_SIDE_PX = 4096;
    static final long MAX_PIXELS = 16_000_000L;

    private static final String MEDIA_DOMAIN = "meeshy.me";
    private static final Pattern IPV4 = Pattern.compile("^\\d{1,3}(\\.\\d{1,3}){3}$");

    private WidgetAvatarRules() {}

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
        if (debug && "http".equals(scheme) && isLocalGateway(h)) return true;
        if (!"https".equals(scheme) || isLiteralIp(h)) return false;
        return h.equals(MEDIA_DOMAIN) || h.endsWith("." + MEDIA_DOMAIN);
    }

    private static boolean isLocalGateway(String host) {
        return "localhost".equals(host) || "10.0.2.2".equals(host);
    }

    private static boolean isLiteralIp(String host) {
        return host.startsWith("[") || host.indexOf(':') >= 0 || IPV4.matcher(host).matches();
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

    /** Un `Content-Length` annonce au-dela du plafond est refuse avant lecture ; inconnu (-1), on lit sous plafond. */
    static boolean acceptsLength(long length) {
        return length <= MAX_BYTES;
    }

    static boolean acceptsDimensions(int width, int height) {
        if (width <= 0 || height <= 0) return false;
        if (width > MAX_SIDE_PX || height > MAX_SIDE_PX) return false;
        return (long) width * height <= MAX_PIXELS;
    }

    /** La plus petite puissance de deux qui ramene le PLUS GRAND cote sous 2 × la pastille. */
    static int sampleSize(int width, int height, int sizePx) {
        int largest = Math.max(width, height);
        int limit = Math.max(1, 2 * sizePx);
        int sample = 1;
        while (largest / sample > limit) sample *= 2;
        return sample;
    }
}
