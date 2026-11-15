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
     * pas : la coque applique la methode documentee par Android. Si au moins un
     * paquet qui gere le lien n'est pas un navigateur, le lien part par un
     * intent SANS paquet impose : le systeme applique le choix par defaut de
     * l'utilisateur ou lui montre le selecteur. La coque ne designe jamais
     * elle-meme l'application, sans quoi une application qui revendique un
     * domaine sans le verifier recevrait le lien en silence.
     */
    static boolean hasSpecializedHandler(List<String> handlers, List<String> browsers) {
        if (handlers == null) {
            return false;
        }
        for (String handler : handlers) {
            if (handler != null && !handler.isEmpty() && (browsers == null || !browsers.contains(handler))) {
                return true;
            }
        }
        return false;
    }
}
