package me.meeshy.app;

import java.util.List;

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
     * #10456 — avant Android 11, `FLAG_ACTIVITY_REQUIRE_NON_BROWSER` n'existe
     * pas : la coque applique la methode documentee par Android. Parmi les
     * paquets qui gerent le lien (dans l'ordre de resolution), le premier qui
     * n'est pas un navigateur l'ouvre ; aucun, et le Custom Tab prend le relais.
     */
    static String specializedHandler(List<String> handlers, List<String> browsers) {
        if (handlers == null) {
            return null;
        }
        for (String handler : handlers) {
            if (handler != null && !handler.isEmpty() && (browsers == null || !browsers.contains(handler))) {
                return handler;
            }
        }
        return null;
    }
}
