package me.meeshy.app;

import java.net.URI;
import java.net.URISyntaxException;

/**
 * #10034 — l'ecran ouvert, retrouve quand Android recree la coque (processus
 * tue en arriere-plan, perte du moteur de rendu #8564). Chrome recharge
 * l'onglet a la MEME adresse ; Capacitor recharge toujours l'URL de depart.
 * L'adresse in-app de la WebView devient le lien court `meeshy://` que le
 * routeur web sait deja ouvrir (`src/lib/links/shell-deep-links.ts`).
 */
public final class ShellRoute {

    static final String KEY = "meeshy:route";

    private ShellRoute() {}

    public static String restoreLink(String webViewUrl, String appUrl) {
        if (webViewUrl == null || appUrl == null) return null;
        try {
            URI page = new URI(webViewUrl);
            URI app = new URI(appUrl);
            if (page.getScheme() == null || !page.getScheme().equalsIgnoreCase(app.getScheme())) return null;
            if (page.getHost() == null || !page.getHost().equalsIgnoreCase(app.getHost())) return null;
            String path = page.getRawPath();
            if (path == null || path.isEmpty() || "/".equals(path)) return null;
            String query = page.getRawQuery() == null ? "" : "?" + page.getRawQuery();
            String fragment = page.getRawFragment() == null ? "" : "#" + page.getRawFragment();
            return "meeshy:/" + path + query + fragment;
        } catch (URISyntaxException unreadable) {
            return null;
        }
    }
}
