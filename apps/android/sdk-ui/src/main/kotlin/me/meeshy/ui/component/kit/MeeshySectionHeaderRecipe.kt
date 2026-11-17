package me.meeshy.ui.component.kit

import androidx.compose.runtime.Immutable

/** Les cinq formes : titre de section, sur-titre de groupe, séparateur (un libellé entre deux filets), étape numérotée, bandeau de colonne. */
public enum class MeeshySectionHeaderForm { Title, Overline, Divider, Step, Column }

/** Le contexte de taille : la page (22), une feuille (19), une colonne large (26). */
public enum class MeeshySectionHeaderSize { Page, Sheet, Column }

/** L'état d'une étape : faite (coche), en cours (aplat de la teinte), à faire (contour). */
public enum class MeeshySectionHeaderStepState { Done, Current, Todo }

public enum class MeeshySectionHeaderStepAppearance { Check, Filled, Outlined }

@Immutable
public data class MeeshySectionHeaderValues(
    val form: MeeshySectionHeaderForm,
    val titleFontSize: Double,
    val countFontSize: Double,
    val showsCount: Boolean,
    val countGap: Double,
    val leadingSize: Double,
    val minHeight: Double,
    val isUppercase: Boolean,
    val showsRules: Boolean,
    val ruleGap: Double,
    val showsChevron: Boolean,
    val chevronDegrees: Double,
    val isWholeRowTappable: Boolean,
    val pressVeil: Double,
    val pressScale: Double,
    val liveDotSize: Double,
    val liveDotGap: Double,
    val accessoryBelowTitle: Boolean,
)

/**
 * **La recette de K44 en valeurs** : la police par forme et par taille, le compteur accolé, la tête, le chevron de repli, la
 * hauteur de la ligne (44 au moins), l'appui, le témoin « en direct », l'accessoire qui passe dessous aux grandes tailles. Un
 * compteur absent ou nul ne rend ni nombre ni écart. Jumeau iOS : `MeeshySectionHeaderRecipe`.
 */
public object MeeshySectionHeaderRecipe {
    public const val COUNT_FONT_SIZE: Double = 16.0
    public const val COUNT_GAP: Double = 8.0
    public const val MIN_HEIGHT: Double = 44.0
    public const val OVERLINE_FONT_SIZE: Double = 11.0
    public const val RULE_GAP: Double = 12.0
    public const val LEAD_GAP: Double = 10.0
    public const val LIVE_DOT: Double = 8.0
    public const val LIVE_DOT_GAP: Double = 10.0
    public const val PRESS_VEIL_OPACITY: Double = 0.09
    public const val PRESSED_SCALE: Double = 0.985
    public const val LARGE_TEXT_SCALE: Double = 1.6

    @Suppress("LongParameterList")
    public fun resolve(
        form: MeeshySectionHeaderForm = MeeshySectionHeaderForm.Title,
        size: MeeshySectionHeaderSize = MeeshySectionHeaderSize.Page,
        count: Int? = null,
        isCollapsible: Boolean = false,
        isExpanded: Boolean = true,
        isPressed: Boolean = false,
        isLive: Boolean = false,
        textScale: Double = 1.0,
    ): MeeshySectionHeaderValues {
        val hasCount = (count ?: 0) > 0
        return MeeshySectionHeaderValues(
            form = form,
            titleFontSize = titleFontSize(form, size),
            countFontSize = COUNT_FONT_SIZE,
            showsCount = hasCount,
            countGap = if (hasCount) COUNT_GAP else 0.0,
            leadingSize = leadingSize(form, size),
            minHeight = MIN_HEIGHT,
            isUppercase = form == MeeshySectionHeaderForm.Overline,
            showsRules = form == MeeshySectionHeaderForm.Divider,
            ruleGap = RULE_GAP,
            showsChevron = isCollapsible,
            chevronDegrees = if (isCollapsible && !isExpanded) 180.0 else 0.0,
            isWholeRowTappable = isCollapsible,
            pressVeil = if (isCollapsible && isPressed) PRESS_VEIL_OPACITY else 0.0,
            pressScale = if (isCollapsible && isPressed) PRESSED_SCALE else 1.0,
            liveDotSize = if (isLive) LIVE_DOT else 0.0,
            liveDotGap = if (isLive) LIVE_DOT_GAP else 0.0,
            accessoryBelowTitle = textScale >= LARGE_TEXT_SCALE,
        )
    }

    public fun titleFontSize(form: MeeshySectionHeaderForm, size: MeeshySectionHeaderSize): Double = when (form) {
        MeeshySectionHeaderForm.Overline, MeeshySectionHeaderForm.Divider -> OVERLINE_FONT_SIZE
        MeeshySectionHeaderForm.Step -> 19.0
        MeeshySectionHeaderForm.Title, MeeshySectionHeaderForm.Column -> when (size) {
            MeeshySectionHeaderSize.Page -> 22.0
            MeeshySectionHeaderSize.Sheet -> 19.0
            MeeshySectionHeaderSize.Column -> 26.0
        }
    }

    public fun leadingSize(form: MeeshySectionHeaderForm, size: MeeshySectionHeaderSize): Double = when {
        form == MeeshySectionHeaderForm.Step -> 26.0
        size == MeeshySectionHeaderSize.Column -> 44.0
        else -> 32.0
    }

    public fun stepAppearance(state: MeeshySectionHeaderStepState): MeeshySectionHeaderStepAppearance = when (state) {
        MeeshySectionHeaderStepState.Done -> MeeshySectionHeaderStepAppearance.Check
        MeeshySectionHeaderStepState.Current -> MeeshySectionHeaderStepAppearance.Filled
        MeeshySectionHeaderStepState.Todo -> MeeshySectionHeaderStepAppearance.Outlined
    }
}
