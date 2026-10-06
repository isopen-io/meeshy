package me.meeshy.app;

/**
 * #9531 — la luminosite demandee par la page devient celle de la fenetre :
 * bornee a [0, 1], et une valeur negative ou illisible rend la main au reglage
 * du systeme (`WindowManager.LayoutParams.BRIGHTNESS_OVERRIDE_NONE`).
 */
final class ScreenBrightnessRules {

    static final float SYSTEM = -1f;

    private ScreenBrightnessRules() {}

    static float window(float requested) {
        if (Float.isNaN(requested) || requested < 0f) return SYSTEM;
        return Math.min(requested, 1f);
    }
}
