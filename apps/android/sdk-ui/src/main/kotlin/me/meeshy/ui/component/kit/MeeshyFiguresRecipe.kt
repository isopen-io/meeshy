package me.meeshy.ui.component.kit

import androidx.compose.runtime.Immutable

/** Les trois tailles du chiffre : héros (48), large par défaut (34), compact (24). */
public enum class MeeshyFigureSize { Hero, Large, Compact }

/** La flèche d'une tendance : un SENS que la forme dit, pas seulement la couleur. */
public enum class MeeshyFigureTrendArrow { UpRight, DownRight, Right }

/** La tendance d'un chiffre : un sens et un texte déjà écrit par l'hôte. */
public sealed interface MeeshyFigureTrend {
    public val text: String
    public val arrow: MeeshyFigureTrendArrow

    public data class Up(override val text: String) : MeeshyFigureTrend {
        override val arrow: MeeshyFigureTrendArrow get() = MeeshyFigureTrendArrow.UpRight
    }

    public data class Down(override val text: String) : MeeshyFigureTrend {
        override val arrow: MeeshyFigureTrendArrow get() = MeeshyFigureTrendArrow.DownRight
    }

    public data class Flat(override val text: String) : MeeshyFigureTrend {
        override val arrow: MeeshyFigureTrendArrow get() = MeeshyFigureTrendArrow.Right
    }
}

/** Un point de la mini-courbe, dans son cadre. */
@Immutable
public data class MeeshySparkPoint(val x: Double, val y: Double)

@Immutable
public data class MeeshyFiguresValues(
    val size: MeeshyFigureSize,
    val fontSize: Double,
    val separatorCount: Int,
    val separatorsAreHorizontal: Boolean,
    val showsSkeleton: Boolean,
    val isEmpty: Boolean,
)

/**
 * **La recette de K34 en valeurs** : la police par taille, le nombre de filets d'une bande, le passage en compact sous 360,
 * l'échelle d'une courbe dans son cadre, la jauge d'une rangée de part, les positions qui roulent, la phrase dite. Aucune mise
 * en forme de nombre : `value` arrive déjà écrit. Les barres sont à K50. Jumeau iOS : `MeeshyFiguresRecipe`.
 */
public object MeeshyFiguresRecipe {
    public const val UNIT_FONT_SIZE: Double = 12.5
    public const val UNIT_GAP: Double = 2.0
    public const val MINIMUM_SCALE: Double = 0.6
    public const val TREND_HEIGHT: Double = 20.0
    public const val TREND_ARROW: Double = 12.0
    public const val SEPARATOR_GAP: Double = 16.0
    public const val TIGHT_BAND_WIDTH: Double = 360.0
    public const val SPARK_WIDTH: Double = 72.0
    public const val SPARK_HEIGHT: Double = 28.0
    public const val SPARK_STROKE: Double = 2.0
    public const val SPARK_AREA_OPACITY: Double = 0.14
    public const val SPARK_DOT: Double = 6.0
    public const val SPARK_PADDING: Double = 3.0
    public const val SHARE_MINIMUM_FILL: Double = 4.0
    public const val SHARE_ROW_LIMIT: Int = 4
    public const val SHARE_BADGE: Double = 38.0
    public const val SHARE_GAUGE: Double = 8.0
    public const val EMPTY_VALUE: String = "—"
    private const val BAND_MAX = 4

    @Suppress("LongParameterList")
    public fun resolve(
        size: MeeshyFigureSize,
        count: Int = 1,
        width: Double = 390.0,
        isLoading: Boolean = false,
        isEmpty: Boolean = false,
        isStacked: Boolean = false,
        hasValue: Boolean = false,
    ): MeeshyFiguresValues {
        val clamped = count.coerceIn(1, BAND_MAX)
        val resolved = if (clamped == BAND_MAX && width < TIGHT_BAND_WIDTH) MeeshyFigureSize.Compact else size
        return MeeshyFiguresValues(
            size = resolved,
            fontSize = fontSize(resolved),
            separatorCount = clamped - 1,
            separatorsAreHorizontal = isStacked,
            showsSkeleton = isLoading && !hasValue,
            isEmpty = isEmpty,
        )
    }

    public fun fontSize(size: MeeshyFigureSize): Double = when (size) {
        MeeshyFigureSize.Hero -> 48.0
        MeeshyFigureSize.Large -> 34.0
        MeeshyFigureSize.Compact -> 24.0
    }

    /**
     * La mini-courbe : au moins deux points, sinon rien. Les valeurs non finies valent le minimum ; une série constante se pose
     * au milieu. Tout reste dans le cadre, marge du point final comprise.
     */
    public fun sparkPoints(points: List<Double>, width: Double, height: Double): List<MeeshySparkPoint> {
        if (points.size < 2 || !width.isFinite() || !height.isFinite()) return emptyList()
        val finite = points.filter { it.isFinite() }
        val low = finite.minOrNull() ?: 0.0
        val span = (finite.maxOrNull() ?: 0.0) - low
        val inner = maxOf(height - SPARK_PADDING * 2, 0.0)
        val last = (points.size - 1).toDouble()
        return points.mapIndexed { index, raw ->
            val value = if (raw.isFinite()) raw else low
            val share = if (span > 0) (value - low) / span else 0.5
            MeeshySparkPoint(x = index / last * width, y = SPARK_PADDING + (1 - share) * inner)
        }
    }

    /** La jauge d'une rangée de part : bornée de 0 à la largeur ; une part qui existe ne descend jamais sous 4. */
    public fun shareFill(share: Double, width: Double): Double {
        if (!share.isFinite() || share <= 0 || !width.isFinite()) return 0.0
        return (minOf(share, 1.0) * width).coerceIn(minOf(SHARE_MINIMUM_FILL, width), width)
    }

    public fun visibleShareRows(count: Int): Int = count.coerceIn(0, SHARE_ROW_LIMIT)

    /**
     * Les positions des chiffres qui diffèrent, alignées par la fin ; seuls les chiffres roulent, jamais les espaces ni les
     * signes. À la première apparition (`old` absent), rien ne roule.
     */
    public fun changedPositions(old: String?, new: String): List<Int> {
        if (old == null) return emptyList()
        return new.indices.filter { index ->
            val counterpart = old.length - (new.length - index)
            new[index].isDigit() && (counterpart < 0 || old[counterpart] != new[index])
        }
    }

    public fun displayedValue(value: String?): String = if (value.isNullOrEmpty()) EMPTY_VALUE else value

    /** La phrase dite : la valeur, puis l'unité ; sans valeur, le mot de l'hôte. */
    public fun spoken(value: String?, unit: String, emptyLabel: String): String =
        "${if (value.isNullOrEmpty()) emptyLabel else value} $unit"

    /** Une bande est UN élément : ses chiffres, dits d'un trait. */
    public fun spokenBand(parts: List<String>): String = parts.joinToString(", ")
}
