package me.meeshy.app;

/**
 * #9533 — sous Android 15 (API 35), la coque n'est pas bord a bord : le theme
 * `DayNight` peint les barres selon le SYSTEME, et `SystemBars.setStyle` ne
 * regle que leurs icones. La coque peint donc le fond de la couleur
 * `theme-color` de la page, comme Chrome peint sa barre. La barre de
 * navigation ne se peint que la ou ses boutons savent passer au sombre
 * (API 26) : plus tot, ils restent blancs et la barre reste noire.
 */
public final class SystemBarPaint {

    static final int EDGE_TO_EDGE_SDK = 35;
    static final int DARK_NAVIGATION_BUTTONS_SDK = 26;

    private SystemBarPaint() {}

    public static boolean paintsStatus(int sdk) {
        return sdk < EDGE_TO_EDGE_SDK;
    }

    public static boolean paintsNavigation(int sdk) {
        return sdk >= DARK_NAVIGATION_BUTTONS_SDK && sdk < EDGE_TO_EDGE_SDK;
    }

    public static Integer opaque(String hex) {
        if (hex == null || hex.length() != 7 || hex.charAt(0) != '#') return null;
        try {
            return 0xFF000000 | Integer.parseInt(hex.substring(1), 16);
        } catch (NumberFormatException unreadable) {
            return null;
        }
    }
}
