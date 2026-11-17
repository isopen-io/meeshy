package me.meeshy.ui.component.kit

import androidx.compose.runtime.Immutable

public enum class MeeshyReorderRank { Hidden, Ordinal }

public enum class MeeshyReorderPhase { Rest, Grabbed, Flying, Dropped }

public enum class MeeshyReorderHandleEdge { Trailing, Leading }

/** Les déplacements que la voix et le clavier proposent, au même titre que le glisser. */
public enum class MeeshyReorderMove { Up, Down, ToStart, ToEnd }

@Immutable
public data class MeeshyReorderValues(
    val handleWidthDp: Float,
    val handleHeightDp: Float,
    val rankBadgeDp: Float,
    val scale: Float,
    val tiltDegrees: Float,
    val lifted: Boolean,
    val handleOpacity: Float,
    val emphasized: Boolean,
    val showsRank: Boolean,
    val isPending: Boolean,
    val dropHaloDp: Float,
)

/**
 * K52 · la loi de la liste réordonnable : tout ordre réglable au doigt l'est aussi sans le doigt. Le glisser, les actions
 * de la voix et le clavier appellent le même `onMove(from, to)`. Jumeau iOS : `MeeshyReorderList`.
 */
public object MeeshyReorderListRecipe {
    public const val HANDLE_WIDTH_DP: Float = 44f
    public const val HANDLE_NARROW_WIDTH_DP: Float = 32f
    public const val HANDLE_HEIGHT_DP: Float = 44f
    public const val RANK_BADGE_DP: Float = 30f
    public const val GRAB_SCALE: Float = 1.02f
    public const val FLY_TILT_DEGREES: Float = 2f
    public const val DISABLED_HANDLE_OPACITY: Float = 0.32f
    public const val DROP_HALO_DP: Float = 4f
    public const val DROP_HALO_MILLIS: Int = 600
    public const val LONG_PRESS_MILLIS: Long = 350L
    public const val RANK_SECOND_OPACITY: Float = 0.34f
    public const val RANK_REST_OPACITY: Float = 0.16f

    /** La pastille de rang suit la position, jamais l'élément : pleine au premier, 34 % au deuxième, 16 % ensuite. */
    public fun rankOpacity(position: Int): Float = when {
        position < 1 -> 1f
        position == 1 -> RANK_SECOND_OPACITY
        else -> RANK_REST_OPACITY
    }

    /** Déplace un élément : une NOUVELLE liste, bornes tenues ; sans effet, la même liste. */
    public fun <T> move(ids: List<T>, from: Int, to: Int): List<T> {
        val last = ids.lastIndex
        if (last < 0 || from < 0 || from > last) return ids
        val target = to.coerceIn(0, last)
        if (target == from) return ids
        val rest = ids.filterIndexed { index, _ -> index != from }
        return buildList {
            addAll(rest.take(target))
            add(ids[from])
            addAll(rest.drop(target))
        }
    }

    /** Où la rangée saisie tomberait : son centre, décalé du doigt, dit dans quelle case de l'ordre d'origine il se trouve. */
    public fun targetIndex(from: Int, offset: Float, heights: List<Float>, spacingDp: Float): Int {
        val last = heights.lastIndex
        if (last < 0 || from < 0 || from > last) return maxOf(from, 0)
        val tops = heights.indices.runningFold(0f) { top, index -> top + heights[index] + spacingDp }
        val center = tops[from] + heights[from] / 2f + offset
        val slot = heights.indices.firstOrNull { center < tops[it] + heights[it] + spacingDp }
        return slot ?: last
    }

    /** Les déplacements permis à un rang, dans l'ordre : monter, descendre, tout en haut, tout en bas. */
    public fun voiceMoves(index: Int, count: Int): List<MeeshyReorderMove> {
        if (count < 2 || index !in 0 until count) return emptyList()
        return buildList {
            if (index > 0) add(MeeshyReorderMove.Up)
            if (index < count - 1) add(MeeshyReorderMove.Down)
            if (index > 0) add(MeeshyReorderMove.ToStart)
            if (index < count - 1) add(MeeshyReorderMove.ToEnd)
        }
    }

    public fun destination(move: MeeshyReorderMove, index: Int, count: Int): Int = when (move) {
        MeeshyReorderMove.Up -> (index - 1).coerceAtLeast(0)
        MeeshyReorderMove.Down -> (index + 1).coerceAtMost(count - 1)
        MeeshyReorderMove.ToStart -> 0
        MeeshyReorderMove.ToEnd -> (count - 1).coerceAtLeast(0)
    }

    @Suppress("LongParameterList")
    public fun resolve(
        phase: MeeshyReorderPhase = MeeshyReorderPhase.Rest,
        rank: MeeshyReorderRank = MeeshyReorderRank.Hidden,
        isFirst: Boolean = false,
        emphasizesFirst: Boolean = false,
        isEnabled: Boolean = true,
        isPending: Boolean = false,
        handleEdge: MeeshyReorderHandleEdge = MeeshyReorderHandleEdge.Trailing,
        reduceMotion: Boolean = false,
    ): MeeshyReorderValues {
        val lifted = phase == MeeshyReorderPhase.Grabbed || phase == MeeshyReorderPhase.Flying
        return MeeshyReorderValues(
            handleWidthDp = if (handleEdge == MeeshyReorderHandleEdge.Leading) HANDLE_NARROW_WIDTH_DP else HANDLE_WIDTH_DP,
            handleHeightDp = HANDLE_HEIGHT_DP,
            rankBadgeDp = RANK_BADGE_DP,
            scale = if (lifted && !reduceMotion) GRAB_SCALE else 1f,
            tiltDegrees = if (phase == MeeshyReorderPhase.Flying && !reduceMotion) FLY_TILT_DEGREES else 0f,
            lifted = lifted,
            handleOpacity = if (isEnabled) 1f else DISABLED_HANDLE_OPACITY,
            emphasized = emphasizesFirst && isFirst,
            showsRank = rank == MeeshyReorderRank.Ordinal,
            isPending = isPending,
            dropHaloDp = if (phase == MeeshyReorderPhase.Dropped) DROP_HALO_DP else 0f,
        )
    }
}
