package me.meeshy.app;

/**
 * #9533 — la couleur `theme-color` de la page, rendue opaque pour peindre le
 * fond de la fenetre derriere les barres systeme. #12447 — la coque est bord a
 * bord a toute version : elle ne peint plus les barres elles-memes.
 */
public final class SystemBarPaint {

    private SystemBarPaint() {}

    public static Integer opaque(String hex) {
        if (hex == null || hex.length() != 7 || hex.charAt(0) != '#') return null;
        try {
            return 0xFF000000 | Integer.parseInt(hex.substring(1), 16);
        } catch (NumberFormatException unreadable) {
            return null;
        }
    }
}
