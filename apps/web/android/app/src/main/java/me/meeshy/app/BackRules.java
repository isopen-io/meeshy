package me.meeshy.app;

/**
 * #10585 — sur Android 16 (API cible 36), le systeme n'anime le retour a
 * l'accueil que si aucun callback de retour n'est actif. La coque n'intercepte
 * donc le retour que lorsqu'elle a quelque chose a reculer : une video en
 * plein ecran, ou l'historique de la WebView. A la racine, le retour revient
 * au systeme, avec son apercu, comme une PWA installee par Chrome.
 */
public final class BackRules {

    private BackRules() {}

    public static boolean interceptsBack(boolean fullscreen, boolean canGoBack) {
        return fullscreen || canGoBack;
    }
}
