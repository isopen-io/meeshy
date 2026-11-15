package me.meeshy.sdk.model.appearance

import kotlin.math.abs

/*
 * Les rôles de peinture d'un modèle, résolus (#10631, spec § 5.1) — MIROIR de `AppearancePaint.swift`.
 * `ink`, `soft` et `base` viennent de la palette du schéma ; `accent` est l'accent EFFECTIF du lecteur
 * (celui de la palette si elle en fixe un) ; `accent-next` / `accent-prev` sont cet accent tourné de ±30°,
 * la dérivation de la palette d'accent de conversation (même calcul que `DynamicColorGenerator.hueShiftedHex`,
 * dupliqué ici parce que :core:model ne dépend pas de :sdk-core — les deux sont gardés par un test de valeurs).
 */
object PaintRoleResolver {

    const val FALLBACK_ACCENT = "#6366F1"
    const val HUE_STEP_DEGREES = 30.0

    /** `#RRGGBB` d'un rôle pour une palette de schéma et l'accent effectif du lecteur. */
    fun hex(role: AppearancePaintRole, palette: AppearanceDesignPalette, accentHex: String): String {
        val effective = palette.accent ?: normalizedAccent(accentHex)
        return when (role) {
            AppearancePaintRole.INK -> palette.ink
            AppearancePaintRole.SOFT -> palette.soft
            AppearancePaintRole.BASE -> palette.base
            AppearancePaintRole.ACCENT -> effective
            AppearancePaintRole.ACCENT_NEXT -> hueShifted(effective, HUE_STEP_DEGREES)
            AppearancePaintRole.ACCENT_PREV -> hueShifted(effective, -HUE_STEP_DEGREES)
        }
    }

    /** Indigo Meeshy si l'accent n'est pas un `#RRGGBB` (dièse facultatif) : rien de non validé n'est peint. */
    fun normalizedAccent(hex: String): String {
        val digits = hex.removePrefix("#")
        val valid = digits.length == 6 && digits.all { it in '0'..'9' || it in 'a'..'f' || it in 'A'..'F' }
        return if (valid) "#" + digits.uppercase() else FALLBACK_ACCENT
    }

    /** La teinte tournée de [degrees], `#RRGGBB` majuscule ; mêmes troncatures que le domicile TypeScript. */
    fun hueShifted(hex: String, degrees: Double): String {
        val value = hex.removePrefix("#").toLongOrNull(16) ?: 0L
        val red = ((value shr 16) and 0xFF).toInt()
        val green = ((value shr 8) and 0xFF).toInt()
        val blue = (value and 0xFF).toInt()
        val hsv = toHsv(red, green, blue)
        var hue = hsv[0] + degrees / 360.0
        if (hue > 1) hue -= 1.0
        if (hue < 0) hue += 1.0
        val rgb = toRgb(hue, hsv[1], hsv[2])
        return "#%02X%02X%02X".format(rgb[0], rgb[1], rgb[2])
    }

    private fun toHsv(red: Int, green: Int, blue: Int): DoubleArray {
        val r = red / 255.0
        val g = green / 255.0
        val b = blue / 255.0
        val max = maxOf(r, g, b)
        val delta = max - minOf(r, g, b)
        val raw = when {
            delta == 0.0 -> 0.0
            max == r -> 60.0 * (((g - b) / delta) % 6.0)
            max == g -> 60.0 * (((b - r) / delta) + 2.0)
            else -> 60.0 * (((r - g) / delta) + 4.0)
        }
        val degrees = if (raw < 0) raw + 360.0 else raw
        return doubleArrayOf(degrees / 360.0, if (max == 0.0) 0.0 else delta / max, max)
    }

    private fun toRgb(hueUnit: Double, saturation: Double, value: Double): IntArray {
        val h = hueUnit * 360.0
        val c = value * saturation
        val x = c * (1 - abs((h / 60.0) % 2 - 1))
        val m = value - c
        val (r, g, b) = when {
            h < 60 -> Triple(c, x, 0.0)
            h < 120 -> Triple(x, c, 0.0)
            h < 180 -> Triple(0.0, c, x)
            h < 240 -> Triple(0.0, x, c)
            h < 300 -> Triple(x, 0.0, c)
            else -> Triple(c, 0.0, x)
        }
        return intArrayOf(((r + m) * 255).toInt(), ((g + m) * 255).toInt(), ((b + m) * 255).toInt())
    }
}
