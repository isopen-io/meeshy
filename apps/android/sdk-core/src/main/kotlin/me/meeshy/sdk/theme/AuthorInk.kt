package me.meeshy.sdk.theme

import me.meeshy.sdk.theme.DynamicColorGenerator.ThemeMode
import kotlin.math.pow
import kotlin.math.roundToInt

/**
 * #17874 — la couleur d'un auteur rendue LISIBLE (4,5:1) sur ce que le fil peint sous elle : telle quelle
 * quand elle l'est déjà, sinon rapprochée de l'encre du thème du plus PETIT pas qui tient le contraste.
 * Miroir Kotlin pur de `legibleTint` / `authorInk` du web (`apps/web/src/lib/view/author-ink.ts`) et d'`AuthorInk`
 * iOS : mêmes fonds, même pas, même résultat — une couleur d'auteur, une seule façon de la rendre lisible.
 * `DynamicColorGenerator.adaptedColor` (plancher de luminosité, sans mesure) reste celui de l'écran d'appel.
 */
object AuthorInk {
    private data class BackdropStop(val base: String, val tint: Double)

    /**
     * Les fonds d'un schéma : la surface et la carte, puis CHAQUE arrêt du fond du fil teinté par l'accent au
     * pire, seul puis sous la lueur d'accent prise au pire (blanc en sombre, noir en clair) — la teinte reste
     * ainsi indépendante de la conversation où l'auteur écrit.
     */
    private class Scheme(
        val surface: String,
        val card: String,
        val ink: String,
        val worstAccent: String,
        val backdropStops: List<BackdropStop>,
        val glow: Double,
    ) {
        val backgrounds: List<String> by lazy {
            val stops = backdropStops.map { mix(it.base, worstAccent, it.tint) }
            listOf(surface, card) + stops + stops.map { mix(it, worstAccent, glow) }
        }
    }

    private val dark = Scheme(
        surface = "09090B", card = "13111C", ink = "EEF2FF", worstAccent = "FFFFFF",
        backdropStops = listOf(BackdropStop("0F0C29", 0.0), BackdropStop("0F0C29", 0.12), BackdropStop("24243E", 0.0)),
        glow = 0.12,
    )
    private val light = Scheme(
        surface = "FFFFFF", card = "F8F7FF", ink = "1E1B4B", worstAccent = "000000",
        backdropStops = listOf(BackdropStop("FFFFFF", 0.08), BackdropStop("FFFFFF", 0.0), BackdropStop("FFFFFF", 0.05)),
        glow = 0.07,
    )

    private const val MINIMUM_CONTRAST = 4.5
    private const val STEP = 0.04
    private val steps = (0..(1 / STEP).let { kotlin.math.ceil(it).toInt() }).map { minOf(1.0, it * STEP) }

    private fun scheme(mode: ThemeMode) = if (mode == ThemeMode.DARK) dark else light

    /** `hex` (avec ou sans dièse) lisible sur les fonds de [mode], en hex nu majuscule. */
    fun hex(hex: String, mode: ThemeMode): String {
        val scheme = scheme(mode)
        val tint = hex.trim().removePrefix("#").uppercase()
        return steps.map { mix(tint, scheme.ink, it) }.firstOrNull { isLegible(it, scheme.backgrounds) } ?: scheme.ink
    }

    fun backgrounds(mode: ThemeMode): List<String> = scheme(mode).backgrounds

    private fun isLegible(hex: String, backgrounds: List<String>): Boolean =
        backgrounds.all { contrast(hex, it) >= MINIMUM_CONTRAST }

    private fun channels(hex: String): List<Double> {
        val value = hex.toInt(16)
        return listOf(16, 8, 0).map { ((value shr it) and 0xFF).toDouble() }
    }

    private fun mix(from: String, to: String, t: Double): String {
        val a = channels(from)
        val b = channels(to)
        return (0..2).joinToString("") { "%02X".format((a[it] + (b[it] - a[it]) * t).roundToInt()) }
    }

    private fun luminance(hex: String): Double {
        val (r, g, b) = channels(hex).map { c ->
            val s = c / 255
            if (s <= 0.03928) s / 12.92 else ((s + 0.055) / 1.055).pow(2.4)
        }
        return 0.2126 * r + 0.7152 * g + 0.0722 * b
    }

    private fun contrast(a: String, b: String): Double {
        val la = luminance(a)
        val lb = luminance(b)
        return (maxOf(la, lb) + 0.05) / (minOf(la, lb) + 0.05)
    }
}
