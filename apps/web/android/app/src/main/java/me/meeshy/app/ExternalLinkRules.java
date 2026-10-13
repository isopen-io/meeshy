package me.meeshy.app;

import java.util.List;
import java.util.Set;

/**
 * Le tri des navigations que la coque ouvre hors de la WebView (#9858) : un
 * lien web vers un autre hote que celui de l'app. Tout le reste (`mailto:`,
 * `tel:`, `data:`, `blob:`, l'origine de l'app, un lien illisible) garde la
 * politique de Capacitor (`Bridge.launchIntent`).
 */
final class ExternalLinkRules {

    private ExternalLinkRules() {}

    static boolean opensOutside(String scheme, String host, String appHost) {
        if (scheme == null || host == null || host.isEmpty()) {
            return false;
        }
        boolean web = "https".equalsIgnoreCase(scheme) || "http".equalsIgnoreCase(scheme);
        return web && !host.equalsIgnoreCase(appHost);
    }

    /**
     * Avant Android 11 (#10456), `FLAG_ACTIVITY_REQUIRE_NON_BROWSER` n'existe
     * pas : l'app qui gere le lien sans etre un navigateur se deduit de deux
     * listes, celles des apps qui gerent CE lien et celle des navigateurs.
     */
    static String specializedHandler(List<String> handlers, Set<String> browsers) {
        for (String handler : handlers) {
            if (!browsers.contains(handler)) {
                return handler;
            }
        }
        return null;
    }
}
