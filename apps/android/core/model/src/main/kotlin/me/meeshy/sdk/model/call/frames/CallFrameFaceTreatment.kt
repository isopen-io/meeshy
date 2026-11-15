package me.meeshy.sdk.model.call.frames

import java.text.BreakIterator
import java.util.Locale
import kotlin.math.abs
import kotlin.math.cos
import kotlin.math.hypot
import kotlin.math.sin
import me.meeshy.sdk.model.call.frames.CallFrameRenderKit.color
import me.meeshy.sdk.model.call.frames.CallFrameRenderKit.mix

/** Les modes de fusion dont le traitement des visages a besoin (ceux de `TONE_FILTERS`, rendus en couches). */
public enum class CallFrameToneBlend { NORMAL, COLOR, SOFT_LIGHT, MULTIPLY, SCREEN, LIGHTEN }

public data class CallFrameToneLayer(val blend: CallFrameToneBlend, val color: CallFrameColor)

/**
 * LE TON D'UN VISAGE (§ 4.2) : les filtres CSS du web rendus en une saturation (1 = intacte, 0 = grise)
 * suivie de couches fusionnées, DANS la découpe de la case. La saturation s'applique à l'image elle-même
 * (un filtre de couleur, exact à toute version d'Android) ; les couches se fusionnent par-dessus.
 */
public data class CallFrameToneRecipe(val saturation: Double, val layers: List<CallFrameToneLayer>) {
    public val isIdentity: Boolean get() = saturation == 1.0 && layers.isEmpty()

    public companion object {
        private val DEFAULT_DUOTONE = CallFrameDuotone(shadow = "#1E1B4B", light = "#F0ABFC")

        private fun gray(level: Double, alpha: Double = 1.0) = CallFrameColor(level, level, level, alpha)

        private fun layer(blend: CallFrameToneBlend, color: CallFrameColor) = CallFrameToneLayer(blend, color)

        public fun of(tone: CallFrameTone, duotone: CallFrameDuotone?): CallFrameToneRecipe = when (tone) {
            CallFrameTone.COLOR -> CallFrameToneRecipe(1.0, emptyList())
            CallFrameTone.MONO, CallFrameTone.LUMINOSITY -> CallFrameToneRecipe(0.0, emptyList())
            CallFrameTone.SEPIA -> CallFrameToneRecipe(
                0.0,
                listOf(layer(CallFrameToneBlend.COLOR, CallFrameColor(0.6, 0.45, 0.29, 0.85))),
            )
            CallFrameTone.NOIR -> CallFrameToneRecipe(
                0.0,
                listOf(
                    layer(CallFrameToneBlend.SOFT_LIGHT, gray(0.0, 0.45)),
                    layer(CallFrameToneBlend.MULTIPLY, gray(0.95)),
                ),
            )
            CallFrameTone.WARM -> CallFrameToneRecipe(
                1.0,
                listOf(
                    layer(CallFrameToneBlend.COLOR, CallFrameColor(0.6, 0.45, 0.29, 0.12)),
                    layer(CallFrameToneBlend.SOFT_LIGHT, color("#FF9A3C", 0.22)),
                ),
            )
            CallFrameTone.COOL -> CallFrameToneRecipe(
                0.88,
                listOf(layer(CallFrameToneBlend.SOFT_LIGHT, color("#3C8CFF", 0.24))),
            )
            CallFrameTone.FADED -> CallFrameToneRecipe(
                0.7,
                listOf(
                    layer(CallFrameToneBlend.SCREEN, gray(0.1)),
                    layer(CallFrameToneBlend.MULTIPLY, gray(0.92)),
                    layer(CallFrameToneBlend.NORMAL, gray(1.0, 0.08)),
                ),
            )
            CallFrameTone.DUOTONE -> {
                val pair = duotone ?: DEFAULT_DUOTONE
                CallFrameToneRecipe(
                    0.0,
                    listOf(
                        layer(CallFrameToneBlend.MULTIPLY, color(pair.light)),
                        layer(CallFrameToneBlend.LIGHTEN, color(pair.shadow)),
                    ),
                )
            }
        }
    }
}

/** Les deux extrémités d'un dégradé linéaire. */
public data class CallFrameGradientEnds(val x0: Double, val y0: Double, val x1: Double, val y1: Double)

/** Un fond tel que le peintre le pose : de quoi remplir, sans rien savoir de la toile qui le reçoit. */
public sealed interface CallFrameBackdropPlan {
    public data class Solid(val color: CallFrameColor) : CallFrameBackdropPlan
    public data class Linear(val colors: List<CallFrameColor>, val ends: CallFrameGradientEnds) : CallFrameBackdropPlan
    public data class Radial(
        val colors: List<CallFrameColor>,
        val cx: Double,
        val cy: Double,
        val radius: Double,
    ) : CallFrameBackdropPlan

    /** Le fond d'accent : un dégradé diagonal puis une lumière douce en haut à gauche. */
    public data class Accent(val gradient: Linear, val light: Radial) : CallFrameBackdropPlan
}

/**
 * LE FOND (§ 4.3) — uni, dégradé linéaire, radial, ou accent de la conversation. Le noir opaque est posé
 * d'abord par le peintre : un dégradé qui ne couvre pas tout ne laisse jamais de transparent.
 */
public object CallFrameBackdropGeometry {
    public val ACCENT_FALLBACK: CallFrameAccent = CallFrameAccent(primary = "#6366F1", secondary = "#4338CA")

    public fun plan(background: CallFrameBackground, accent: CallFrameAccent?, width: Double, height: Double): CallFrameBackdropPlan =
        when (background) {
            is CallFrameBackground.Solid -> CallFrameBackdropPlan.Solid(color(background.color))
            is CallFrameBackground.Linear ->
                CallFrameBackdropPlan.Linear(background.colors.map { color(it) }, linearEnds(width, height, background.angle))
            is CallFrameBackground.Radial -> CallFrameBackdropPlan.Radial(
                background.colors.map { color(it) },
                width / 2,
                height / 2,
                hypot(width, height) / 2,
            )
            CallFrameBackground.Accent -> {
                val served = accent ?: ACCENT_FALLBACK
                CallFrameBackdropPlan.Accent(
                    CallFrameBackdropPlan.Linear(
                        listOf(mix(served.primary, "#FFFFFF", 0.08), color(served.primary), color(served.secondary)),
                        CallFrameGradientEnds(0.0, 0.0, width, height),
                    ),
                    CallFrameBackdropPlan.Radial(
                        listOf(CallFrameColor(1.0, 1.0, 1.0, 0.18), CallFrameColor(1.0, 1.0, 1.0, 0.0)),
                        width * 0.22,
                        height * 0.1,
                        hypot(width, height) * 0.6,
                    ),
                )
            }
        }

    /** L'axe d'un dégradé d'angle [angle] (degrés) qui couvre exactement la toile. */
    public fun linearEnds(width: Double, height: Double, angle: Double): CallFrameGradientEnds {
        val radians = angle * kotlin.math.PI / 180
        val dx = sin(radians)
        val dy = cos(radians)
        val half = (abs(width * dx) + abs(height * dy)) / 2
        val cx = width / 2
        val cy = height / 2
        return CallFrameGradientEnds(cx - dx * half, cy - dy * half, cx + dx * half, cy + dy * half)
    }

    /** Les positions égales d'un dégradé de [count] couleurs ; une seule couleur est doublée. */
    public fun stops(count: Int): List<Double> = when {
        count <= 0 -> emptyList()
        count == 1 -> listOf(0.0, 1.0)
        else -> (0 until count).map { it.toDouble() / (count - 1) }
    }
}

/**
 * LE PORTRAIT ABSENT (§ 2) : une caméra coupée montre un dégradé propre à la personne et son initiale,
 * jamais une case retirée.
 */
public object CallFramePlaceholder {
    private val HUES: List<Pair<String, String>> = listOf(
        "#6366F1" to "#A855F7", "#0EA5E9" to "#6366F1", "#F97316" to "#EC4899", "#10B981" to "#0EA5E9",
        "#F59E0B" to "#EF4444", "#8B5CF6" to "#EC4899", "#14B8A6" to "#22C55E",
    )

    /** Le `hashOf` du web : `(hash · 31 + point de code) >>> 0` depuis 7, sur les points de code. */
    public fun hash(value: String): Long {
        var h = 7
        value.codePoints().forEach { h = h * 31 + it }
        return h.toLong() and 0xFFFFFFFFL
    }

    /** Les deux couleurs du dégradé de la personne [id]. */
    public fun hues(id: String): Pair<String, String> = HUES[(hash(id) % HUES.size).toInt()]

    /** L'initiale du nom (premier caractère visible, en capitale), ou `null` si le nom est vide. */
    public fun initial(name: String, locale: Locale = Locale.getDefault()): String? {
        val trimmed = name.trim()
        if (trimmed.isEmpty()) return null
        val breaks = BreakIterator.getCharacterInstance().apply { setText(trimmed) }
        val first = trimmed.substring(0, breaks.next())
        return first.uppercase(locale)
    }
}

/**
 * LA CLÉ D'UNE SCÈNE — ce dont dépendent les couches fond et dessus : le cadre, les personnes, les textes,
 * l'accent, les bandes réservées, la taille et les extras posés par d'autres peintres. Si la clé ne change
 * pas, les couches ne se repeignent pas.
 */
public object CallFrameLayerKey {
    private const val UNIT_SEPARATOR = '\u001F'
    private const val RECORD_SEPARATOR = '\u001E'
    private const val EMPTY = "∅"

    public fun of(
        frameId: String,
        people: List<CallFramePerson>,
        texts: CallFrameTexts,
        width: Double,
        height: Double,
        reserve: CallFrameChromeReserve = CallFrameChromeReserve.NONE,
        extras: String = "",
    ): String {
        val head = listOf(
            frameId,
            people.size.toString(),
            "${width.roundedPixels()}x${height.roundedPixels()}",
            texts.groupName ?: EMPTY,
            if (texts.isGroup) "g" else "d",
            texts.date,
            texts.accentHex?.let { "${it.primary}/${it.secondary}" } ?: EMPTY,
            "${reserve.top}/${reserve.bottom}",
            extras,
        )
        val who = people.map {
            listOf(it.id, it.name, it.handle ?: "", if (it.isSelf) "1" else "0").joinToString(RECORD_SEPARATOR.toString())
        }
        return (head + who).joinToString(UNIT_SEPARATOR.toString())
    }

    private fun Double.roundedPixels(): Int = Math.round(this).toInt()
}
