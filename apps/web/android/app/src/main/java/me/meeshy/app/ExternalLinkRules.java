package me.meeshy.app;

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
}
