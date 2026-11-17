package me.meeshy.ui.component.kit

import androidx.compose.runtime.Immutable

/** Les tailles de la rangée : compact (36), régulière (44), large (56), l'en-tête d'une feuille (jamais pressable), la ligne dans une phrase (26). */
public enum class MeeshyPersonRowSize { Compact, Regular, Large, Header, Inline }

/** Les trois tenues : normale, atténuée (avatar à 40 %, textes sourds, accessoire vif) et fantôme (disque en pointillé). */
public enum class MeeshyPersonRowOutfit { Normal, Muted, Ghost }

/** La sélection : aucune, un seul choix (point plein) ou plusieurs (coche). */
public sealed interface MeeshyPersonRowSelection {
    public data object None : MeeshyPersonRowSelection

    public data class Single(val isSelected: Boolean) : MeeshyPersonRowSelection

    public data class Multiple(val isSelected: Boolean) : MeeshyPersonRowSelection
}

public enum class MeeshyPersonRowSelectionShape { Check, Dot }

@Immutable
public data class MeeshyPersonRowValues(
    val size: MeeshyPersonRowSize,
    val avatarSize: Double,
    val leadingMargin: Double,
    val avatarGap: Double,
    val trailingMargin: Double,
    val dividerInset: Double,
    val rowHeight: Double,
    val titleFontSize: Double,
    val subtitleFontSize: Double,
    val metaFontSize: Double,
    val metaDetailFontSize: Double,
    val titleAccessorySize: Double,
    val avatarOpacity: Double,
    val isAvatarGhost: Boolean,
    val isMutedText: Boolean,
    val trailingOpacity: Double,
    val showsDivider: Boolean,
    val isPressable: Boolean,
    val pressVeil: Double,
    val pressScale: Double,
    val showsSelectionMark: Boolean,
    val selectionShape: MeeshyPersonRowSelectionShape?,
    val isSelected: Boolean,
    val metaBelowSubtitle: Boolean,
)

/**
 * **La recette de K39 en valeurs** : la hauteur, la place de l'avatar, les écarts, le retrait du filet, les polices, les opacités
 * des tenues, la sélection et la phrase dite. La rangée ne dessine aucune présence : l'avatar est un emplacement de l'hôte.
 * Jumeau iOS : `MeeshyPersonRowRecipe`.
 */
public object MeeshyPersonRowRecipe {
    public const val LEADING_MARGIN: Double = 18.0
    public const val TRAILING_MARGIN: Double = 18.0
    public const val AVATAR_GAP: Double = 14.0
    public const val SUBTITLE_FONT_SIZE: Double = 12.5
    public const val META_FONT_SIZE: Double = 16.0
    public const val META_DETAIL_FONT_SIZE: Double = 11.5
    public const val TITLE_ACCESSORY_SIZE: Double = 16.0
    public const val MUTED_AVATAR_OPACITY: Double = 0.4
    public const val PRESS_VEIL_OPACITY: Double = 0.08
    public const val MINIMUM_TARGET: Double = 44.0
    public const val LARGE_TEXT_SCALE: Double = 1.6

    @Suppress("LongParameterList")
    public fun resolve(
        size: MeeshyPersonRowSize = MeeshyPersonRowSize.Regular,
        outfit: MeeshyPersonRowOutfit = MeeshyPersonRowOutfit.Normal,
        selection: MeeshyPersonRowSelection = MeeshyPersonRowSelection.None,
        hasPress: Boolean = false,
        isPressed: Boolean = false,
        textScale: Double = 1.0,
    ): MeeshyPersonRowValues {
        val avatar = avatarSize(size)
        val pressable = (hasPress || selection != MeeshyPersonRowSelection.None) && size != MeeshyPersonRowSize.Header
        return MeeshyPersonRowValues(
            size = size,
            avatarSize = avatar,
            leadingMargin = LEADING_MARGIN,
            avatarGap = AVATAR_GAP,
            trailingMargin = TRAILING_MARGIN,
            dividerInset = LEADING_MARGIN + avatar + AVATAR_GAP,
            rowHeight = rowHeight(size),
            titleFontSize = titleFontSize(size),
            subtitleFontSize = SUBTITLE_FONT_SIZE,
            metaFontSize = META_FONT_SIZE,
            metaDetailFontSize = META_DETAIL_FONT_SIZE,
            titleAccessorySize = TITLE_ACCESSORY_SIZE,
            avatarOpacity = if (outfit == MeeshyPersonRowOutfit.Muted) MUTED_AVATAR_OPACITY else 1.0,
            isAvatarGhost = outfit == MeeshyPersonRowOutfit.Ghost,
            isMutedText = outfit != MeeshyPersonRowOutfit.Normal,
            trailingOpacity = 1.0,
            showsDivider = size != MeeshyPersonRowSize.Header && size != MeeshyPersonRowSize.Inline,
            isPressable = pressable,
            pressVeil = if (pressable && isPressed) PRESS_VEIL_OPACITY else 0.0,
            pressScale = 1.0,
            showsSelectionMark = selection != MeeshyPersonRowSelection.None,
            selectionShape = shape(selection),
            isSelected = isSelected(selection),
            metaBelowSubtitle = textScale >= LARGE_TEXT_SCALE,
        )
    }

    public fun avatarSize(size: MeeshyPersonRowSize): Double = when (size) {
        MeeshyPersonRowSize.Compact -> 36.0
        MeeshyPersonRowSize.Regular -> 44.0
        MeeshyPersonRowSize.Large, MeeshyPersonRowSize.Header -> 56.0
        MeeshyPersonRowSize.Inline -> 26.0
    }

    public fun rowHeight(size: MeeshyPersonRowSize): Double = when (size) {
        MeeshyPersonRowSize.Compact -> 52.0
        MeeshyPersonRowSize.Regular -> 64.0
        MeeshyPersonRowSize.Large -> 76.0
        MeeshyPersonRowSize.Header -> 88.0
        MeeshyPersonRowSize.Inline -> 32.0
    }

    public fun titleFontSize(size: MeeshyPersonRowSize): Double = when (size) {
        MeeshyPersonRowSize.Header -> 22.0
        MeeshyPersonRowSize.Inline -> 13.0
        else -> 15.0
    }

    /** Une seule phrase : les parties vides sont omises, dans l'ordre reçu. */
    public fun spokenLabel(parts: List<String?>): String = parts.filterNotNull().filter { it.isNotEmpty() }.joinToString(", ")

    private fun shape(selection: MeeshyPersonRowSelection): MeeshyPersonRowSelectionShape? = when (selection) {
        MeeshyPersonRowSelection.None -> null
        is MeeshyPersonRowSelection.Single -> MeeshyPersonRowSelectionShape.Dot
        is MeeshyPersonRowSelection.Multiple -> MeeshyPersonRowSelectionShape.Check
    }

    private fun isSelected(selection: MeeshyPersonRowSelection): Boolean = when (selection) {
        MeeshyPersonRowSelection.None -> false
        is MeeshyPersonRowSelection.Single -> selection.isSelected
        is MeeshyPersonRowSelection.Multiple -> selection.isSelected
    }
}
