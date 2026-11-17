package me.meeshy.ui.component.kit

import androidx.compose.ui.graphics.Color
import kotlin.math.abs
import kotlin.math.max
import kotlin.math.min
import kotlin.math.pow

/**
 * **La couleur en valeurs** : ce qu'il faut pour mesurer un contraste, assombrir et décaler une teinte sans rien dessiner.
 * Les recettes de K27, K30 et K31 y calculent ; seule la vue remet un [Color]. Jumeau iOS : `MeeshyKitRGB`.
 */
public object MeeshyKitColor {
    private const val LINEAR_KNEE = 0.03928f
    private const val DARKEN_STEP = 0.02f

    /** La luminance relative WCAG. */
    public fun luminance(color: Color): Double {
        fun linear(channel: Float): Double =
            if (channel <= LINEAR_KNEE) channel / 12.92 else ((channel + 0.055) / 1.055).pow(2.4)
        return 0.2126 * linear(color.red) + 0.7152 * linear(color.green) + 0.0722 * linear(color.blue)
    }

    /** Le rapport de contraste WCAG entre deux couleurs, de 1 à 21. */
    public fun contrast(first: Color, second: Color): Double {
        val a = luminance(first)
        val b = luminance(second)
        return (max(a, b) + 0.05) / (min(a, b) + 0.05)
    }

    /** [color] mêlée à [other] : [share] de [other], de 0 à 1. */
    public fun mixed(color: Color, other: Color, share: Float): Color {
        val amount = if (share.isFinite()) share.coerceIn(0f, 1f) else 0f
        return Color(
            red = color.red + (other.red - color.red) * amount,
            green = color.green + (other.green - color.green) * amount,
            blue = color.blue + (other.blue - color.blue) * amount,
        )
    }

    /** La teinte assombrie, au moins, jusqu'à [ratio] de contraste sur [background] ; une teinte lisible ne bouge pas. */
    public fun darkened(color: Color, ratio: Double, background: Color): Color {
        var candidate = color
        var share = 0f
        while (contrast(candidate, background) < ratio && share < 1f) {
            share = min(share + DARKEN_STEP, 1f)
            candidate = mixed(color, Color.Black, share)
        }
        return candidate
    }

    /** L'encre posée sur [tint] : le blanc ou [darkInk], selon le meilleur contraste. */
    public fun inkOn(tint: Color, darkInk: Color): Color =
        if (contrast(Color.White, tint) >= contrast(darkInk, tint)) Color.White else darkInk

    /** La teinte décalée de [degrees] sur la roue (K27 : -30 pour l'orbe lointaine). Un gris ne bouge pas. */
    public fun hueShifted(color: Color, degrees: Double): Color {
        val high = max(color.red, max(color.green, color.blue))
        val low = min(color.red, min(color.green, color.blue))
        val delta = (high - low).toDouble()
        if (delta <= 0.0) return color
        val sector = when (high) {
            color.red -> ((color.green - color.blue) / delta) % 6
            color.green -> (color.blue - color.red) / delta + 2
            else -> (color.red - color.green) / delta + 4
        }
        val hue = ((sector * 60 + degrees) % 360).let { if (it < 0) it + 360 else it }
        return fromHsb(hue, delta / high, high.toDouble())
    }

    /** Le niveau de gris de même luminance perçue : la bannière d'un compte éteint. */
    public fun desaturated(color: Color): Color {
        val grey = 0.299f * color.red + 0.587f * color.green + 0.114f * color.blue
        return Color(grey, grey, grey)
    }

    private fun fromHsb(hue: Double, saturation: Double, brightness: Double): Color {
        val chroma = brightness * saturation
        val sector = hue / 60
        val second = chroma * (1 - abs(sector % 2 - 1))
        val offset = brightness - chroma
        val (r, g, b) = when (sector.toInt() % 6) {
            0 -> Triple(chroma, second, 0.0)
            1 -> Triple(second, chroma, 0.0)
            2 -> Triple(0.0, chroma, second)
            3 -> Triple(0.0, second, chroma)
            4 -> Triple(second, 0.0, chroma)
            else -> Triple(chroma, 0.0, second)
        }
        return Color((r + offset).toFloat().coerceIn(0f, 1f), (g + offset).toFloat().coerceIn(0f, 1f), (b + offset).toFloat().coerceIn(0f, 1f))
    }
}
