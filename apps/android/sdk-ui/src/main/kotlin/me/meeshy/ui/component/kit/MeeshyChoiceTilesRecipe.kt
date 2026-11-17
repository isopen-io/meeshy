package me.meeshy.ui.component.kit

import androidx.compose.runtime.Immutable

public enum class MeeshyChoiceContent { Option, Value, Icon }

public enum class MeeshyChoiceFormat { Square, Wide, Compact }

public enum class MeeshyChoiceSurface { Tonal, Glass }

/** L'état d'une tuile : active, éteinte, ou verrouillée avec la raison dite à la voix. */
public sealed interface MeeshyChoiceItemState {
    public data object Enabled : MeeshyChoiceItemState

    public data object Disabled : MeeshyChoiceItemState

    public data class Locked(val reason: String) : MeeshyChoiceItemState
}

/** La sélection appartient à l'hôte, entière : une valeur ou un ensemble. */
public sealed interface MeeshyChoiceSelection {
    public fun contains(id: String): Boolean

    public data class Single(val id: String?) : MeeshyChoiceSelection {
        override fun contains(id: String): Boolean = this.id == id
    }

    public data class Multiple(val ids: Set<String>) : MeeshyChoiceSelection {
        override fun contains(id: String): Boolean = id in ids
    }
}

@Immutable
public data class MeeshyChoiceTilesValues(
    val columns: Int,
    val format: MeeshyChoiceFormat,
    val radiusDp: Float,
    val paddingDp: Float,
    val gutterDp: Float,
    val titleSp: Float,
    val minHeightDp: Float,
    val headDp: Float,
    val valueSp: Float,
    val checkDp: Float,
    val borderDp: Float,
    val tintedFill: Boolean,
    val showsCheck: Boolean,
    val invertsDisc: Boolean,
    val pressScale: Float,
    val pressVeil: Float,
    val opacity: Float,
    val isLocked: Boolean,
    val isDisabled: Boolean,
    val checkFades: Boolean,
)

/**
 * K47 · la loi des tuiles de choix : toucher change une valeur et rien d'autre. Le choix se marque par TROIS signes à la
 * fois (bord de 2, fond teinté, coche), jamais par la couleur seule. Jumeau iOS : `MeeshyChoiceTiles`.
 */
public object MeeshyChoiceTilesRecipe {
    public const val MIN_COLUMNS: Int = 2
    public const val MAX_COLUMNS: Int = 4
    public const val HEAD_MEDALLION_DP: Float = 46f
    public const val HEAD_ICON_DP: Float = 28f
    public const val ICON_DISC_DP: Float = 54f
    public const val CHECK_DP: Float = 24f
    public const val DETAIL_SP: Float = 12.5f
    public const val SELECTED_BORDER_DP: Float = 2f
    public const val LOCKED_BORDER_DP: Float = 1.5f
    public const val BORDER_DP: Float = 1f
    public const val PRESS_SCALE: Float = 0.96f
    public const val PRESS_VEIL: Float = 0.13f
    public const val DISABLED_OPACITY: Float = 0.4f
    public const val VALUE_HEIGHT_DP: Float = 132f
    public const val VALUE_SP: Float = 40f
    public const val VALUE_DENSE_SP: Float = 30f

    public fun columns(columns: Int?): Int = (columns ?: MIN_COLUMNS).coerceIn(MIN_COLUMNS, MAX_COLUMNS)

    private fun radius(format: MeeshyChoiceFormat) = if (format == MeeshyChoiceFormat.Compact) 22f else 24f

    private fun padding(format: MeeshyChoiceFormat) = if (format == MeeshyChoiceFormat.Compact) 11f else 16f

    private fun title(format: MeeshyChoiceFormat) = if (format == MeeshyChoiceFormat.Compact) 14.5f else 16.5f

    private fun minHeight(format: MeeshyChoiceFormat) = when (format) {
        MeeshyChoiceFormat.Square -> 0f
        MeeshyChoiceFormat.Wide -> 80f
        MeeshyChoiceFormat.Compact -> 68f
    }

    @Suppress("LongParameterList")
    public fun resolve(
        content: MeeshyChoiceContent = MeeshyChoiceContent.Option,
        format: MeeshyChoiceFormat = MeeshyChoiceFormat.Square,
        surface: MeeshyChoiceSurface = MeeshyChoiceSurface.Tonal,
        columns: Int? = null,
        isSelected: Boolean = false,
        isPressed: Boolean = false,
        state: MeeshyChoiceItemState = MeeshyChoiceItemState.Enabled,
        reduceMotion: Boolean = false,
    ): MeeshyChoiceTilesValues {
        val cols = columns(columns)
        val locked = state is MeeshyChoiceItemState.Locked
        val disabled = state == MeeshyChoiceItemState.Disabled
        val selected = isSelected && !locked && !disabled
        val live = isPressed && !locked && !disabled
        return MeeshyChoiceTilesValues(
            columns = cols,
            format = format,
            radiusDp = radius(format),
            paddingDp = padding(format),
            gutterDp = if (surface == MeeshyChoiceSurface.Glass) 8f else 10f,
            titleSp = title(format),
            minHeightDp = if (content == MeeshyChoiceContent.Value) VALUE_HEIGHT_DP else minHeight(format),
            headDp = if (content == MeeshyChoiceContent.Icon) ICON_DISC_DP else HEAD_MEDALLION_DP,
            valueSp = if (cols >= MAX_COLUMNS) VALUE_DENSE_SP else VALUE_SP,
            checkDp = CHECK_DP,
            borderDp = when {
                locked -> LOCKED_BORDER_DP
                selected -> SELECTED_BORDER_DP
                else -> BORDER_DP
            },
            tintedFill = selected,
            showsCheck = selected && content != MeeshyChoiceContent.Icon,
            invertsDisc = selected && content == MeeshyChoiceContent.Icon,
            pressScale = if (live && !reduceMotion) PRESS_SCALE else 1f,
            pressVeil = if (live) PRESS_VEIL else 0f,
            opacity = if (disabled) DISABLED_OPACITY else 1f,
            isLocked = locked,
            isDisabled = disabled,
            checkFades = reduceMotion,
        )
    }
}
