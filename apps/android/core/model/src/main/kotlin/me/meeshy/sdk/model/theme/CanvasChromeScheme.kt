package me.meeshy.sdk.model.theme

import me.meeshy.sdk.model.StoryBackgroundValue
import kotlin.math.pow

/**
 * La teinte du chrome posé SUR un canevas : [Dark] = chrome BLANC (fond sombre, la convention du
 * plein écran), [Light] = chrome SOMBRE (fond clair). Miroir du `ColorScheme` que
 * `CanvasChromeScheme.swift` épingle sur les grappes de contrôles.
 */
enum class ChromeScheme { Dark, Light }

/** La polarité du halo posé sous un glyphe nu : toujours l'OPPOSÉE de celle du glyphe. */
enum class HaloPolarity { Black, White }

/**
 * Résout le [ChromeScheme] du chrome (boutons, rails, barre haute) posé sur le canevas d'une story
 * — composer ET lecteur. Le fond appartient au CONTENU, pas au thème de l'app. Pur : aucune
 * dépendance Android, le bitmap arrive en pixels ARGB. Miroir de `CanvasChromeScheme.swift`.
 *
 * Seuil : l'équilibre WCAG ([DARK_THRESHOLD] ≈ 0,179) — sous cette luminance, le blanc contraste
 * mieux que le noir. Un fond MÉDIA bascule plus tard ([MEDIA_DARK_THRESHOLD], 0,35) : le verre
 * dépoli ajoute du contraste local.
 */
object CanvasChromeScheme {

    const val DARK_THRESHOLD: Double = 0.179
    const val MEDIA_DARK_THRESHOLD: Double = 0.35

    /** L'opacité du voile sans bord posé sous un texte de scène (le halo étalé). */
    const val SCENE_TEXT_VEIL_OPACITY: Double = 0.25

    /** Côté du bitmap rééchantillonné pour mesurer la luminance d'un fond média. */
    const val SAMPLE_SIDE: Int = 8

    private const val INK_ON_DARK_HEX = "EEF2FF"
    private const val INK_ON_LIGHT_HEX = "1E1B4B"

    /** Luminance relative WCAG d'un hex `RRGGBB` (`#` optionnel) ; `null` si invalide. */
    fun relativeLuminance(hex: String): Double? {
        val digits = hex.trim().removePrefix("#")
        if (digits.length != 6) return null
        return HexColor.parse(digits)?.luminance
    }

    /**
     * Luminance d'un fond de slide SÉRIALISÉ (`RRGGBB`, `#RRGGBB`, `gradient:AAAAAA:BBBBBB` —
     * moyenne des deux stops) ; `null` si absent ou illisible.
     */
    fun backgroundLuminance(background: String?): Double? {
        if (background.isNullOrEmpty()) return null
        return when (val value = StoryBackgroundValue.parse(background.replace("#", ""))) {
            is StoryBackgroundValue.Hex -> relativeLuminance(value.hex)
            is StoryBackgroundValue.Gradient -> {
                val a = relativeLuminance(value.start) ?: return null
                val b = relativeLuminance(value.end) ?: return null
                (a + b) / 2
            }
        }
    }

    /**
     * Luminance moyenne d'un bitmap rééchantillonné (pixels ARGB sRGB encodés, 8×8 attendu) :
     * moyenne de la luminance LINÉARISÉE de chaque pixel ; `null` si aucun pixel.
     */
    fun averageRelativeLuminance(argbPixels: IntArray): Double? {
        if (argbPixels.isEmpty()) return null
        val total = argbPixels.sumOf { argb ->
            luminance(
                red = ((argb shr 16) and 0xFF) / 255.0,
                green = ((argb shr 8) and 0xFF) / 255.0,
                blue = (argb and 0xFF) / 255.0,
            )
        }
        return total / argbPixels.size
    }

    /**
     * Scheme du chrome pour un fond. Un fond MÉDIA suit la luminance RÉELLE de son bitmap quand
     * elle est connue ; sans mesure (vidéo sans vignette, chargement), la convention [Dark].
     * Fond couleur : luminance WCAG du hex/gradient ; illisible ou absent → [Dark].
     */
    fun scheme(background: String?, hasMediaBackground: Boolean, mediaLuminance: Double? = null): ChromeScheme {
        if (hasMediaBackground) {
            if (mediaLuminance == null) return ChromeScheme.Dark
            return if (mediaLuminance < MEDIA_DARK_THRESHOLD) ChromeScheme.Dark else ChromeScheme.Light
        }
        return schemeForBareGlyphOver(backgroundLuminance(background))
    }

    /**
     * Scheme d'un glyphe posé NU (sans verre ni pastille) : bascule à l'équilibre WCAG, la
     * frontière d'un fond uni, où chaque teinte du chrome tient 3:1 sur toute luminance uniforme.
     */
    fun schemeForBareGlyphOver(luminance: Double?): ChromeScheme {
        if (luminance == null) return ChromeScheme.Dark
        return if (luminance < DARK_THRESHOLD) ChromeScheme.Dark else ChromeScheme.Light
    }

    /** Le halo, plancher de lisibilité d'un glyphe nu : noir sous un glyphe blanc, blanc sinon. */
    fun legibilityHalo(scheme: ChromeScheme): HaloPolarity =
        if (scheme == ChromeScheme.Dark) HaloPolarity.Black else HaloPolarity.White

    /** L'encre d'un texte de scène : PRIMAIRE (indigo50 sur fond sombre, indigo950 sur fond clair). */
    fun sceneTextInkHex(scheme: ChromeScheme): String =
        if (scheme == ChromeScheme.Dark) INK_ON_DARK_HEX else INK_ON_LIGHT_HEX

    /** Luminance de l'encre de scène du [scheme]. */
    fun sceneTextInkLuminance(scheme: ChromeScheme): Double =
        requireNotNull(relativeLuminance(sceneTextInkHex(scheme)))

    /**
     * Luminance d'un fond sRGB (canaux 0…1) une fois couvert du voile de [scheme] à
     * [SCENE_TEXT_VEIL_OPACITY] — composition « source over » en sRGB encodé.
     */
    fun luminanceUnderSceneTextVeil(red: Double, green: Double, blue: Double, scheme: ChromeScheme): Double {
        val halo = if (scheme == ChromeScheme.Dark) 0.0 else 1.0
        val a = SCENE_TEXT_VEIL_OPACITY
        fun veiled(c: Double) = halo * a + c * (1 - a)
        return luminance(veiled(red), veiled(green), veiled(blue))
    }

    /** Rapport de contraste WCAG 2.x entre deux luminances relatives. */
    fun contrastRatio(a: Double, b: Double): Double = (maxOf(a, b) + 0.05) / (minOf(a, b) + 0.05)

    /** Luminance relative WCAG 2.x de canaux sRGB encodés (0…1). */
    fun luminance(red: Double, green: Double, blue: Double): Double =
        0.2126 * linear(red) + 0.7152 * linear(green) + 0.0722 * linear(blue)

    private fun linear(c: Double): Double = if (c <= 0.03928) c / 12.92 else ((c + 0.055) / 1.055).pow(2.4)
}
