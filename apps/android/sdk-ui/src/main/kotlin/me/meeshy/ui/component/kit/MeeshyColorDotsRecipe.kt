package me.meeshy.ui.component.kit

import androidx.compose.runtime.Immutable
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import me.meeshy.ui.theme.MeeshyBorder
import me.meeshy.ui.theme.MeeshyControlSize
import me.meeshy.ui.theme.MeeshyMediaChromeColors
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshySpacing
import java.text.NumberFormat
import java.util.Locale
import kotlin.math.max
import kotlin.math.min

/** Le remplissage d'une pastille : uni, dégradé, ou disque creux (« Aucun »). Miroir de `MeeshyColorDotFill` (iOS). */
@Immutable
public sealed interface MeeshyColorDotFill {
    @Immutable
    public data class Solid(public val color: Color) : MeeshyColorDotFill

    @Immutable
    public data class Gradient(public val colors: List<Color>) : MeeshyColorDotFill

    @Immutable
    public data object Hollow : MeeshyColorDotFill
}

/** Une pastille. [id] est stable et unique, choisi par l'hôte ; [name] le nom déjà traduit ; [icon] un glyphe au centre. */
@Immutable
public data class MeeshyColorDot(
    public val id: String,
    public val fill: MeeshyColorDotFill,
    public val name: String? = null,
    public val icon: ImageVector? = null,
)

/** Les deux diamètres de K07. La cellule tactile ne change pas avec le diamètre. */
public enum class MeeshyColorDotSize(public val diameter: Double) {
    S28(MeeshyControlSize.small.value.toDouble()),
    S32(MeeshyControlSize.compact.value.toDouble()),
}

/** `Wrap` passe à la ligne ; `Row` tient sur une ligne, défile et s'estompe au bord de fin s'il déborde. */
public enum class MeeshyColorDotsLayout { Wrap, Row }

/** L'encre d'un groupe : celle du média, ou celle du thème (ton [MeeshyGlassTone.Theme]). */
public enum class MeeshyColorDotsInk { OnMedia, ThemeInk }

/** L'encombrement d'un groupe, mesuré aux disques. */
@Immutable
public data class MeeshyColorDotsExtent(public val width: Double, public val height: Double)

/**
 * **La recette de K07 en VALEURS** : toute mesure du groupe vit ici. Miroir de `MeeshyColorDotsRecipe` (iOS).
 *
 * Le disque est centré dans sa cellule ; le premier disque s'aligne au bord du contenu, la cible déborde de [inset].
 * Par ligne : ⌊(largeur + cellule − diamètre) / cellule⌋, au moins 1. La courante : un vide de 2 dp puis un cercle de 2 dp.
 */
@Immutable
public data class MeeshyColorDotsRecipe(
    public val diameter: Double,
    public val cell: Double,
    public val inset: Double,
    public val ringDiameter: Double,
    public val ringWidth: Double,
    public val perRow: Int,
    public val rows: List<Int>,
    public val scrolls: Boolean,
    public val ink: MeeshyColorDotsInk,
) {
    /** La taille que le groupe occupe, mesurée aux disques. */
    public val size: MeeshyColorDotsExtent
        get() = MeeshyColorDotsExtent(
            width = extent(rows.maxOrNull() ?: 0, diameter, cell),
            height = extent(rows.size, diameter, cell),
        )

    /** L'origine de la cellule [index], depuis le coin du contenu : la cible déborde de [inset] avant le premier disque. */
    public fun cellOrigin(index: Int): Pair<Double, Double> {
        val column = if (perRow > 0) index % perRow else 0
        val row = if (perRow > 0) index / perRow else 0
        return Pair(column * cell - inset, row * cell - inset)
    }

    public companion object {
        /** Le filet intérieur au repos (planche : 1 px blanc 25 %). */
        public const val HAIRLINE_OPACITY: Double = 0.25

        /** Le filet au survol du pointeur et sous « Augmenter le contraste ». */
        public const val HAIRLINE_EMPHASIS_OPACITY: Double = 0.6

        /** Le pré-cercle au doigt posé, avant le choix. */
        public const val PRESSED_RING_OPACITY: Double = 0.5

        /** Le contenu désactivé. */
        public const val DISABLED_OPACITY: Double = 0.4

        /** L'échelle d'où paraît le cercle d'une nouvelle courante. */
        public const val RING_ENTER_SCALE: Double = 0.8

        /** Où commence l'estompe du bord de fin d'une ligne qui défile. */
        public const val FADE_START: Double = 0.82

        /** Le contraste minimal de l'encre du cercle sur le fond. */
        public const val INK_MIN_CONTRAST: Double = 3.0

        /** Le contraste minimal du glyphe posé dans un disque. */
        public const val GLYPH_MIN_CONTRAST: Double = 4.0

        /** Le glyphe occupe cette part du diamètre. */
        public const val GLYPH_SCALE: Double = 0.45

        /** La cellule tactile d'Android (48 dp), la cible minimale du jeton. */
        public val DEFAULT_CELL: Double = MeeshyControlSize.minTouchTarget.value.toDouble()

        /**
         * La recette d'un groupe de [count] cellules dans [available] (dp). Un `Wrap` se plie par ligne ; un `Row` reste sur
         * une ligne et défile quand son encombrement dépasse [available].
         */
        public fun resolve(
            count: Int,
            available: Double,
            size: MeeshyColorDotSize,
            layout: MeeshyColorDotsLayout,
            tone: MeeshyGlassTone = MeeshyGlassTone.Deep,
            cell: Double = DEFAULT_CELL,
        ): MeeshyColorDotsRecipe {
            val diameter = size.diameter
            val ringGap = MeeshySpacing.xxs.value.toDouble()
            val ringWidth = MeeshyBorder.strong.value.toDouble()
            val perRow = columns(count, available, diameter, cell, layout)
            return MeeshyColorDotsRecipe(
                diameter = diameter,
                cell = cell,
                inset = (cell - diameter) / 2,
                ringDiameter = diameter + 2 * (ringGap + ringWidth),
                ringWidth = ringWidth,
                perRow = perRow,
                rows = if (count > 0) split(count, perRow) else emptyList(),
                scrolls = layout == MeeshyColorDotsLayout.Row && count > 0 && extent(count, diameter, cell) > available,
                ink = if (tone == MeeshyGlassTone.Theme) MeeshyColorDotsInk.ThemeInk else MeeshyColorDotsInk.OnMedia,
            )
        }

        /** L'encombrement de [cells] cellules jointives : celui de leurs disques. */
        public fun extent(cells: Int, diameter: Double, cell: Double): Double =
            if (cells > 0) cells * cell - (cell - diameter) else 0.0

        /** Le filet : 25 % au repos, 60 % au survol ou en contraste accru. */
        public fun hairline(isHovered: Boolean, increasedContrast: Boolean): Double =
            if (isHovered || increasedContrast) HAIRLINE_EMPHASIS_OPACITY else HAIRLINE_OPACITY

        /** La courante : la seule pastille dont l'identifiant vaut [selection] ; aucune pour `null`. */
        public fun isCurrent(id: String, selection: String?): Boolean = selection == id

        /** Le cercle : plein sur la courante, 50 % sous le doigt, absent sinon. */
        public fun ringOpacity(isSelected: Boolean, isPressed: Boolean): Double = when {
            isSelected -> 1.0
            isPressed -> PRESSED_RING_OPACITY
            else -> 0.0
        }

        /** L'échelle du cercle seul : 1 dès qu'il se voit, [RING_ENTER_SCALE] d'où il paraît. */
        public fun ringScale(isSelected: Boolean, isPressed: Boolean): Double =
            if (isSelected || isPressed) 1.0 else RING_ENTER_SCALE

        /**
         * Le cercle pendant sa transition : [selectedFraction] va de 0 (non courante) à 1 (courante) au ressort, le doigt
         * posé ([isPressed]) agit sans attendre. Aux deux bouts, c'est [ringOpacity].
         */
        public fun ringOpacity(selectedFraction: Double, isPressed: Boolean): Double =
            mix(ringOpacity(false, isPressed), ringOpacity(true, isPressed), selectedFraction)

        /** L'échelle du cercle pendant sa transition ; aux deux bouts, c'est [ringScale]. */
        public fun ringScale(selectedFraction: Double, isPressed: Boolean): Double =
            mix(ringScale(false, isPressed), ringScale(true, isPressed), selectedFraction)

        /** Les arrêts de couleur d'un remplissage : un pour l'uni, ceux du dégradé, aucun pour le creux. */
        public fun stops(fill: MeeshyColorDotFill): List<Color> = when (fill) {
            is MeeshyColorDotFill.Solid -> listOf(fill.color)
            is MeeshyColorDotFill.Gradient -> fill.colors
            MeeshyColorDotFill.Hollow -> emptyList()
        }

        /**
         * L'encre du glyphe : celle du groupe sur un disque creux ou sans arrêt, sinon la plus contrastée du blanc et de
         * l'indigo sombre (le pire arrêt d'un dégradé compte). Miroir de `glyphInk(on:groupInk:)` (iOS).
         */
        public fun glyphInk(fill: MeeshyColorDotFill, groupInk: Color): Color {
            val stops = stops(fill)
            if (stops.isEmpty()) return groupInk
            val light = worstContrast(MeeshyMediaChromeColors.OnMedia, stops)
            val dark = worstContrast(MeeshyPalette.Indigo950, stops)
            return if (light >= dark) MeeshyMediaChromeColors.OnMedia else MeeshyPalette.Indigo950
        }

        /**
         * Le défilement qui centre la cellule [index] d'une ligne vue par [viewport] dp, borné à zéro. Le dernier bord est
         * borné par le défilement lui-même.
         */
        public fun scrollTarget(index: Int, cell: Double, viewport: Double): Double =
            if (index < 0 || !viewport.isFinite()) 0.0 else (index * cell + cell / 2 - viewport / 2).coerceAtLeast(0.0)

        /** Le contraste WCAG le plus faible d'une encre sur des arrêts de couleur. */
        public fun worstContrast(ink: Color, stops: List<Color>): Double = stops.minOf { contrast(ink, it) }

        private fun contrast(first: Color, second: Color): Double {
            val a = first.luminance().toDouble()
            val b = second.luminance().toDouble()
            return (max(a, b) + CONTRAST_OFFSET) / (min(a, b) + CONTRAST_OFFSET)
        }

        private fun columns(count: Int, available: Double, diameter: Double, cell: Double, layout: MeeshyColorDotsLayout): Int =
            when {
                count <= 0 -> 0
                layout == MeeshyColorDotsLayout.Row || !available.isFinite() -> count
                else -> ((available + cell - diameter) / cell).toInt().coerceIn(1, count)
            }

        private fun split(count: Int, perRow: Int): List<Int> {
            val full = List(count / perRow) { perRow }
            val rest = count % perRow
            return if (rest > 0) full + rest else full
        }

        private fun mix(from: Double, to: Double, fraction: Double): Double = from + (to - from) * fraction.coerceIn(0.0, 1.0)

        private const val CONTRAST_OFFSET: Double = 0.05
    }
}

/** Les mots du kit : le nom d'une pastille sans nom, par sa position. Jamais le code de la couleur. */
public object MeeshyColorDotsWords {

    /**
     * La position dite d'une pastille sans nom : [template] (`kit_color_dots_position`, deux `%n$s`) rempli du rang à
     * partir de un et du total, écrits dans les chiffres du lecteur ([locale]). Miroir de `position(index:total:…)` (iOS).
     */
    public fun position(index: Int, total: Int, locale: Locale, template: String): String {
        val numbers = NumberFormat.getIntegerInstance(locale)
        return String.format(locale, template, numbers.format(index + 1), numbers.format(total))
    }

    /** Le nom dit : celui de la pastille s'il n'est pas vide, sinon [position] (rang à partir de un, total). */
    public fun spokenName(dot: MeeshyColorDot, index: Int, total: Int, position: (Int, Int) -> String): String {
        val name = dot.name
        return if (name.isNullOrEmpty()) position(index + 1, total) else name
    }
}
