package me.meeshy.app;

/**
 * #10227 — Chrome Android propose d'allumer la localisation de l'appareil
 * quand une page obtient la permission alors qu'elle est eteinte ; sans cela
 * la WebView rend `POSITION_UNAVAILABLE` et « Reessayer » echoue sans fin.
 * Une permission refusee ne quitte jamais l'application.
 */
public final class LocationPromptRules {

    private LocationPromptRules() {}

    public static boolean opensLocationSettings(boolean allowed, boolean locationEnabled) {
        return allowed && !locationEnabled;
    }
}
