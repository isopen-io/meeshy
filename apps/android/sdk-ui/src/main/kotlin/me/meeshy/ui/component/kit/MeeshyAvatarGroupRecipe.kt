package me.meeshy.ui.component.kit

import androidx.compose.runtime.Immutable

/** Cinq tailles de visage ; le recouvrement et le liseré suivent. */
public enum class MeeshyAvatarGroupSize(public val dp: Int, public val overlapDp: Int, public val ringDp: Float) {
    S26(26, 10, 2f),
    S40(40, 9, 3f),
    S44(44, 10, 3f),
    S56(56, 13, 3.5f),
    S72(72, 17, 4f),
}

public sealed interface MeeshyAvatarGroupLayout {
    public data object Stack : MeeshyAvatarGroupLayout

    public data object Duo : MeeshyAvatarGroupLayout

    public data object Rail : MeeshyAvatarGroupLayout

    /** Une grille de 2, 3 ou 4 colonnes sur deux rangées, la dernière case réservée au compte. */
    public data class Grid(val columns: Int) : MeeshyAvatarGroupLayout
}

/** La sélection se lit par rang : l'hôte garde ses identifiants. */
public sealed interface MeeshyAvatarGroupSelection {
    public fun contains(index: Int): Boolean

    public data class Single(val index: Int?) : MeeshyAvatarGroupSelection {
        override fun contains(index: Int): Boolean = this.index == index
    }

    public data class Multiple(val indices: Set<Int>) : MeeshyAvatarGroupSelection {
        override fun contains(index: Int): Boolean = index in indices
    }
}

@Immutable
public data class MeeshyAvatarGroupValues(
    val isRenderable: Boolean,
    val size: MeeshyAvatarGroupSize,
    val overlapDp: Int,
    val ringDp: Float,
    val visible: Int,
    val overflow: Int,
    val overflowLabel: String?,
    val columns: Int?,
    val breathes: Boolean,
    val haloOpacity: Float,
)

/**
 * K48 · la loi du groupe d'avatars : il range des visages sans savoir qui ils sont et ne compte que ce qui déborde.
 * Jumeau iOS : `MeeshyAvatarGroup`.
 */
public object MeeshyAvatarGroupRecipe {
    public const val STACK_MIN: Int = 2
    public const val STACK_MAX: Int = 5
    public const val OVERFLOW_CAP: Int = 99
    public const val GRID_ROWS: Int = 2
    public const val GRID_MIN_COLUMNS: Int = 2
    public const val GRID_MAX_COLUMNS: Int = 4
    public const val HALO_OPACITY: Float = 0.34f
    public const val SELECTION_RING_DP: Float = 2.5f
    public const val CHECK_DP: Float = 24f
    public const val TAP_DP: Float = 48f
    public const val DEFAULT_MAX: Int = 4

    public fun overflowLabel(overflow: Int): String? = when {
        overflow <= 0 -> null
        overflow > OVERFLOW_CAP -> "$OVERFLOW_CAP+"
        else -> "+$overflow"
    }

    @Suppress("LongParameterList")
    public fun resolve(
        layout: MeeshyAvatarGroupLayout = MeeshyAvatarGroupLayout.Stack,
        size: MeeshyAvatarGroupSize = MeeshyAvatarGroupSize.S40,
        count: Int,
        max: Int = DEFAULT_MAX,
        reduceMotion: Boolean = false,
    ): MeeshyAvatarGroupValues {
        val total = count.coerceAtLeast(0)
        val columns = (layout as? MeeshyAvatarGroupLayout.Grid)?.columns?.coerceIn(GRID_MIN_COLUMNS, GRID_MAX_COLUMNS)
        val visible = when {
            layout == MeeshyAvatarGroupLayout.Duo -> 2
            layout == MeeshyAvatarGroupLayout.Rail -> total
            columns != null -> minOf(total, max.coerceIn(1, columns * GRID_ROWS - 1))
            else -> minOf(total, max.coerceIn(STACK_MIN, STACK_MAX))
        }
        val isFixed = layout == MeeshyAvatarGroupLayout.Duo || layout == MeeshyAvatarGroupLayout.Rail
        val overflow = if (isFixed) 0 else (total - visible).coerceAtLeast(0)
        return MeeshyAvatarGroupValues(
            isRenderable = total > 0 && (layout != MeeshyAvatarGroupLayout.Duo || total == 2),
            size = size,
            overlapDp = size.overlapDp,
            ringDp = size.ringDp,
            visible = visible,
            overflow = overflow,
            overflowLabel = overflowLabel(overflow),
            columns = columns,
            breathes = layout == MeeshyAvatarGroupLayout.Duo && !reduceMotion,
            haloOpacity = HALO_OPACITY,
        )
    }
}
