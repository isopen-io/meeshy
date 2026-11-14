package me.meeshy.sdk.model.call

import kotlin.math.max
import kotlin.math.min

/**
 * #18488 (family of #17927) — a duo AUDIO call at a COMPACT height ([CallGroupStageSizing.isCompactHeight]: a phone in
 * landscape ≈ 360 dp, a low window 320 dp): the whole pill, (…) included, stays inside the window and touchable. The
 * pill is never squeezed, so what is around it yields: the avatar, the name and the duration take their compact form
 * ([CallAudioStageLayout], P9b), the margins under the stage tighten, and the journal open in the pill gives up part of
 * its list — the list scrolls, the base row under it does not leave the window. Mirrors iOS and web (`#18487`).
 */
object CallDuoAudioFit {
    /** What the stage holds above its content: the call's header row (two steps of 20 dp). */
    const val TOP_RESERVE_DP: Float = 40f

    /** Under the stage: the column's 20 dp and the pill block's 20 dp at rest... */
    const val RESTING_MARGIN_DP: Float = 20f

    /** ... and, at a compact height, the pill block's 8 dp alone. */
    const val COMPACT_MARGIN_DP: Float = 8f

    /** The gap between the compact header and the journal glass. */
    const val HEADER_GAP_DP: Float = 4f

    /** What the pill holds around the journal list: its head (56), its foot (56), the base row (68), a safety margin (4). */
    const val JOURNAL_CHROME_DP: Float = 184f

    /** One readable line: the list scrolls, « Back to live » stays. */
    const val MINIMUM_LIST_DP: Float = 44f

    fun columnBottomDp(isCompactHeight: Boolean): Float = if (isCompactHeight) 0f else RESTING_MARGIN_DP

    fun blockBottomDp(isCompactHeight: Boolean): Float = if (isCompactHeight) COMPACT_MARGIN_DP else RESTING_MARGIN_DP

    /** The height of the journal list on a compact stage: what is left once the header, the pill chrome and the margins are served. */
    fun journalListDp(stageHeightDp: Float): Float {
        val room = stageHeightDp - TOP_RESERVE_DP - COMPACT_MARGIN_DP - CallAudioStageLayout.compactAvatarDp(stageHeightDp) -
            HEADER_GAP_DP - JOURNAL_CHROME_DP
        return max(min(room, CallJournalSizing.heightDp(stageHeightDp)), MINIMUM_LIST_DP)
    }
}
