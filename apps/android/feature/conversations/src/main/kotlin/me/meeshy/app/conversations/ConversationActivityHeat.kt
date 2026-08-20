package me.meeshy.app.conversations

import me.meeshy.sdk.model.ApiConversation
import kotlin.math.min

/**
 * Pure "activity heat" for a conversation row — a `[0, 1]` score where 0 renders a
 * cold/pastel background and 1 a hot/vibrant one. A faithful port of iOS
 * `ThemedConversationRow.conversationHeat`:
 *
 * ```
 * 0.40·recency + 0.35·unread + 0.15·members + 0.10·pinned   (muted → 0.05)
 * ```
 *
 * Every weight, cap and recency bucket matches the iOS source exactly, so the two
 * platforms tint identical rows identically. Framework-free (no Compose, no Android
 * time source) so the whole ramp is unit-testable — the row composable feeds it
 * `System.currentTimeMillis()` and the conversation's resolved signals.
 */
public object ConversationActivityHeat {

    private const val WEIGHT_RECENCY = 0.40
    private const val WEIGHT_UNREAD = 0.35
    private const val WEIGHT_MEMBERS = 0.15
    private const val WEIGHT_PINNED = 0.10

    /** A muted conversation is pinned to the cold floor, whatever else it carries. */
    private const val MUTED_HEAT = 0.05

    /** Unread saturates the term at 10 messages; member count saturates at 50. */
    private const val UNREAD_SATURATION = 10.0
    private const val MEMBER_SATURATION = 50.0

    // Recency buckets, in seconds since the last activity (iOS: exclusive `<` edges).
    private const val RECENCY_5_MIN_SECONDS = 300L
    private const val RECENCY_1_HOUR_SECONDS = 3_600L
    private const val RECENCY_1_DAY_SECONDS = 86_400L
    private const val RECENCY_1_WEEK_SECONDS = 604_800L

    /**
     * The activity heat for the given signals. [lastActivityMillis] is the row's
     * last-activity instant (iOS `conversation.lastMessageAt`); `null` — no parseable
     * timestamp — is treated as the coldest recency. A future instant (clock skew)
     * stays in the hottest bucket, matching iOS's `seconds < 300` arm.
     */
    public fun heat(
        lastActivityMillis: Long?,
        nowMillis: Long,
        unreadCount: Int,
        memberCount: Int,
        isPinned: Boolean,
        isMuted: Boolean,
    ): Double {
        if (isMuted) return MUTED_HEAT

        val recency = recencyScore(lastActivityMillis, nowMillis)
        val unread = min(unreadCount / UNREAD_SATURATION, 1.0)
        val members = min(memberCount / MEMBER_SATURATION, 1.0)
        val pinned = if (isPinned) 1.0 else 0.0

        return WEIGHT_RECENCY * recency +
            WEIGHT_UNREAD * unread +
            WEIGHT_MEMBERS * members +
            WEIGHT_PINNED * pinned
    }

    /**
     * The activity heat for [conversation] at [nowMillis], reading its last-activity
     * instant via the [ConversationRowTime] SSOT and its unread/member/pin/mute signals
     * off the resolved preferences.
     */
    public fun of(conversation: ApiConversation, nowMillis: Long): Double {
        val prefs = conversation.resolvedPreferences
        return heat(
            lastActivityMillis = ConversationRowTime.epochMillis(conversation),
            nowMillis = nowMillis,
            unreadCount = conversation.unreadCount,
            memberCount = conversation.memberCount,
            isPinned = prefs?.isPinned == true,
            isMuted = prefs?.isMuted == true,
        )
    }

    private fun recencyScore(lastActivityMillis: Long?, nowMillis: Long): Double {
        lastActivityMillis ?: return 0.0
        val seconds = (nowMillis - lastActivityMillis) / 1000.0
        return when {
            seconds < RECENCY_5_MIN_SECONDS -> 1.0
            seconds < RECENCY_1_HOUR_SECONDS -> 0.8
            seconds < RECENCY_1_DAY_SECONDS -> 0.5
            seconds < RECENCY_1_WEEK_SECONDS -> 0.2
            else -> 0.0
        }
    }

    /** The top/bottom fill opacities of a row's heat gradient. */
    public data class HeatGradient(val topOpacity: Float, val bottomOpacity: Float)

    /**
     * The gradient opacities for a given [heat], keyed by theme (iOS `heatBackground`):
     * a raised floor in dark mode, and a bottom always a quarter of the top so the
     * accent fades from top-leading to bottom-trailing.
     */
    public fun gradient(heat: Double, isDark: Boolean): HeatGradient {
        val top = if (isDark) 0.03 + heat * 0.10 else 0.02 + heat * 0.08
        return HeatGradient(topOpacity = top.toFloat(), bottomOpacity = (top * 0.25).toFloat())
    }
}
