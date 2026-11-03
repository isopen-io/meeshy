package me.meeshy.app.chat

import me.meeshy.sdk.model.composer.ComposerKeyboardTransition

/**
 * Which end of the rendered [ChatListItem] list currently holds the newest
 * message. [BottomUp] is [ChatScreen]'s shipped mode (`LazyColumn(reverseLayout
 * = true)` fed `listItems.asReversed()`, so the rendered list runs
 * newest-to-oldest and the newest message sits at index 0, pinned to the
 * bottom edge); [TopDown] (oldest content at index 0, newest at the last
 * index) is kept as the pre-flip mode, still exercised by every function's
 * original test coverage. See `apps/android/tasks/android-routine/PROGRESS.md`'s
 * "§C inverted-list rewrite" note for the full decomposition this completes.
 */
enum class ChatListOrientation {
    TopDown,
    BottomUp,
}

/**
 * Pure index arithmetic for the message list's scroll behaviour, factored out
 * of [ChatScreen] so it is unit-testable without a Composable/`LazyListState`
 * in the loop. Every function takes the raw indices the screen already reads
 * off `LazyListState`/`listItems` and returns a plain index or boolean — zero
 * Compose dependency.
 *
 * [ChatScreen] wires every call site through [ChatListOrientation.BottomUp]
 * (the shipped `reverseLayout` list); the [ChatListOrientation.TopDown] arm
 * stays fully tested as the pre-flip behaviour every function reproduced
 * byte-for-byte before the screen switched over.
 */
object ChatScrollGeometry {

    /** Rows within this many items of the bottom edge still count as "at the bottom". */
    const val BOTTOM_TOLERANCE_ITEMS = 2

    /** Rows within this many items of the old (top) edge trigger a load-older fetch. */
    const val LOAD_OLDER_THRESHOLD = 2

    /**
     * The row index holding the newest message — the auto-scroll-to-bottom
     * target. Stays `-1` when [lastIndex] itself is `-1` (empty list; there is
     * no row to target).
     */
    fun bottomIndex(lastIndex: Int, orientation: ChatListOrientation): Int {
        if (lastIndex < 0) return lastIndex
        return when (orientation) {
            ChatListOrientation.TopDown -> lastIndex
            ChatListOrientation.BottomUp -> 0
        }
    }

    /**
     * Whether [edgeIndex] — the last-visible row index in
     * [ChatListOrientation.TopDown], the first-visible row index in
     * [ChatListOrientation.BottomUp] — sits within [BOTTOM_TOLERANCE_ITEMS] of
     * [bottomIndex], i.e. close enough to the newest message that a new
     * arrival should auto-stick rather than leave a reader scrolled into
     * history undisturbed. A list with zero or one row ([lastIndex] `<= 0`) is
     * always considered at the bottom.
     */
    fun isNearBottom(edgeIndex: Int, lastIndex: Int, orientation: ChatListOrientation): Boolean {
        if (lastIndex <= 0) return true
        return when (orientation) {
            ChatListOrientation.TopDown -> edgeIndex >= lastIndex - BOTTOM_TOLERANCE_ITEMS
            ChatListOrientation.BottomUp -> edgeIndex <= BOTTOM_TOLERANCE_ITEMS
        }
    }

    /**
     * Whether [edgeIndex] sits within [LOAD_OLDER_THRESHOLD] of the OLD end of
     * the list — the trigger to fetch another page of history. The old end is
     * index 0 in [ChatListOrientation.TopDown] and [lastIndex] in
     * [ChatListOrientation.BottomUp] (a bottom-anchored list stores its oldest
     * row last).
     */
    fun isNearOldEnd(edgeIndex: Int, lastIndex: Int, orientation: ChatListOrientation): Boolean {
        return when (orientation) {
            ChatListOrientation.TopDown -> edgeIndex <= LOAD_OLDER_THRESHOLD
            ChatListOrientation.BottomUp -> edgeIndex >= lastIndex - LOAD_OLDER_THRESHOLD
        }
    }

    /**
     * Which of `LazyListState`'s two Compose-native readings — the lowest
     * visible index ([firstVisibleIndex]) or the highest ([lastVisibleIndex])
     * — currently sits at the chat's BOTTOM edge (nearest the newest
     * message). In [ChatListOrientation.TopDown] the newest message renders
     * last, so the highest visible index is the bottom edge; under
     * `reverseLayout` ([ChatListOrientation.BottomUp]) the newest message is
     * row 0, so the lowest visible index is the bottom edge instead. Feed the
     * result straight into [isNearBottom]'s `edgeIndex`.
     */
    fun bottomEdgeIndex(firstVisibleIndex: Int, lastVisibleIndex: Int, orientation: ChatListOrientation): Int {
        return when (orientation) {
            ChatListOrientation.TopDown -> lastVisibleIndex
            ChatListOrientation.BottomUp -> firstVisibleIndex
        }
    }

    /**
     * The mirror of [bottomEdgeIndex]: which reading currently sits at the
     * chat's OLD (top-of-screen) edge. A chat list always shows its oldest
     * content at the visual top regardless of orientation (the two
     * reversals — item order + `reverseLayout` — cancel), so this also
     * doubles as "the topmost visible row" for [PinnedDayHeader]. Feed the
     * result into [isNearOldEnd]'s `edgeIndex` and
     * [PinnedDayHeader.governingDayMillis]'s `topIndex`.
     */
    fun topEdgeIndex(firstVisibleIndex: Int, lastVisibleIndex: Int, orientation: ChatListOrientation): Int {
        return when (orientation) {
            ChatListOrientation.TopDown -> firstVisibleIndex
            ChatListOrientation.BottomUp -> lastVisibleIndex
        }
    }

    /**
     * Durée (ms) sur laquelle la marge basse du fil rejoint sa nouvelle valeur. Pendant un
     * mouvement de clavier annoncé SANS insets image par image (avant API 30), la marge suit la
     * durée du clavier ; avec des insets par image elle les suit tels quels, et passé le
     * mouvement rien n'est rejoué : une animation de plus ferait traîner le fil derrière la barre.
     */
    fun bottomMarginAnimationMs(transition: ComposerKeyboardTransition?, nowMs: Long): Int {
        if (transition == null || transition.perFrame || !transition.isLive(nowMs)) return 0
        return transition.durationMs.toInt()
    }

    /**
     * Le défilement qui retient immobile le bord ancré d'un message en train de changer de hauteur
     * (dépliage d'un long message, `LongMessageExpansionLaw`) : [edgeBefore] et [edgeAfter] sont les
     * ordonnées écran de ce bord avant et après le changement. Un bord descendu se rattrape en
     * faisant remonter le contenu ; sous `reverseLayout` ([ChatListOrientation.BottomUp]) le sens
     * du défilement est inversé. Borné à ±[maxDelta] (la hauteur du viewport) : un message plus
     * long que l'écran ne fait jamais voler la liste ; sous le demi-pixel, rien ne bouge.
     */
    fun anchoredScrollDelta(
        edgeBefore: Float,
        edgeAfter: Float,
        orientation: ChatListOrientation,
        maxDelta: Float,
    ): Float {
        val shift = edgeAfter - edgeBefore
        if (kotlin.math.abs(shift) <= ANCHOR_TOLERANCE_PX) return 0f
        val signed = if (orientation == ChatListOrientation.BottomUp) -shift else shift
        val bound = kotlin.math.abs(maxDelta)
        return signed.coerceIn(-bound, bound)
    }

    /**
     * Durée (ms) de la marge basse quand elle varie SANS clavier en mouvement (le composeur qui
     * gagne une ligne) : la barre bouge sur sa courbe, le fil la suit sur la même durée au lieu de
     * sauter en une image (iOS `applyBottomInset(_:transition:)`). Pendant un mouvement de clavier,
     * la durée est celle de [bottomMarginAnimationMs].
     */
    const val COMPOSER_INSET_MS = 180

    fun bottomInsetAnimationMs(transition: ComposerKeyboardTransition?, nowMs: Long): Int {
        if (transition != null && transition.isLive(nowMs)) return bottomMarginAnimationMs(transition, nowMs)
        return COMPOSER_INSET_MS
    }

    /** Marge horizontale de la section : les rangées ne touchent pas le bord (iOS `sectionHorizontalInset`). */
    const val SECTION_HORIZONTAL_INSET_DP = 12

    /** Précharger l'ancien tant que le bord chargé est à moins de ce nombre de hauteurs d'écran (iOS « rouleau »). */
    const val PRELOAD_VIEWPORTS = 4f

    /** Zone de confort avant l'apparition du bouton « dernier message » (iOS `nearBottomFollowThreshold`). */
    const val NEAR_BOTTOM_THRESHOLD_DP = 200f

    /**
     * Distance estimée (px) entre le dernier pixel affiché et le bord ANCIEN chargé. [edgeIndex] est
     * la rangée visible la plus proche de ce bord (la plus haute sous [ChatListOrientation.BottomUp],
     * la plus basse sous [ChatListOrientation.TopDown]) ; [edgeOvershootPx] ce qui dépasse encore de
     * cette rangée hors du viewport ; les rangées non composées sont estimées à [averageRowPx].
     */
    fun distanceToOldEdgePx(
        edgeIndex: Int,
        lastIndex: Int,
        edgeOvershootPx: Float,
        averageRowPx: Float,
        orientation: ChatListOrientation,
    ): Float {
        val rowsBeyond = when (orientation) {
            ChatListOrientation.TopDown -> edgeIndex
            ChatListOrientation.BottomUp -> lastIndex - edgeIndex
        }.coerceAtLeast(0)
        return edgeOvershootPx.coerceAtLeast(0f) + rowsBeyond * averageRowPx.coerceAtLeast(0f)
    }

    /** Vrai quand l'ancien doit être demandé : à moins de [PRELOAD_VIEWPORTS] hauteurs d'écran du bord chargé. */
    fun shouldLoadOlder(distanceToOldEdgePx: Float, viewportPx: Float): Boolean =
        viewportPx > 0f && distanceToOldEdgePx < viewportPx * PRELOAD_VIEWPORTS

    /**
     * Distance (px) du bas du fil sous [ChatListOrientation.BottomUp] : le défilement de la rangée 0
     * plus les rangées passées, estimées à [averageRowPx].
     */
    fun distanceFromBottomPx(firstVisibleIndex: Int, firstVisibleOffsetPx: Int, averageRowPx: Float): Float =
        firstVisibleOffsetPx.coerceAtLeast(0) + firstVisibleIndex.coerceAtLeast(0) * averageRowPx.coerceAtLeast(0f)

    /** Le seuil « près du bas » du bouton « dernier message », strict comme iOS (`offset < seuil`). */
    fun isNearBottomPx(distanceFromBottomPx: Float, thresholdPx: Float): Boolean =
        distanceFromBottomPx < thresholdPx

    private const val ANCHOR_TOLERANCE_PX = 0.5f
}
