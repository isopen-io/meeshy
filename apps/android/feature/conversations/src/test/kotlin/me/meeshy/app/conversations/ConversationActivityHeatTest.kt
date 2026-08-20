package me.meeshy.app.conversations

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.ApiConversation
import me.meeshy.sdk.model.ApiConversationLastMessage
import me.meeshy.sdk.model.ApiConversationPreferences
import me.meeshy.sdk.model.ApiParticipant
import org.junit.Test

/**
 * Behavioural coverage for [ConversationActivityHeat] — the pure "activity heat"
 * score (0 = cold/pastel, 1 = hot/vibrant) that tints a conversation row's
 * background gradient. A faithful port of iOS `ThemedConversationRow.conversationHeat`
 * (`0.40·recency + 0.35·unread + 0.15·members + 0.10·pinned`, muted → 0.05) and
 * `heatBackground` (the isDark-keyed top/bottom opacity ramp).
 */
class ConversationActivityHeatTest {

    private val now = 1_000_000_000_000L

    private fun heat(
        lastActivityMillis: Long? = now,
        nowMillis: Long = now,
        unreadCount: Int = 0,
        memberCount: Int = 0,
        isPinned: Boolean = false,
        isMuted: Boolean = false,
    ): Double = ConversationActivityHeat.heat(
        lastActivityMillis = lastActivityMillis,
        nowMillis = nowMillis,
        unreadCount = unreadCount,
        memberCount = memberCount,
        isPinned = isPinned,
        isMuted = isMuted,
    )

    private fun secondsAgo(seconds: Long): Long = now - seconds * 1000L

    // MARK: - Muted short-circuit

    @Test
    fun `a muted conversation is always the cold floor regardless of every other signal`() {
        val h = heat(
            lastActivityMillis = now, // most recent
            unreadCount = 100, // capped hot
            memberCount = 100, // capped hot
            isPinned = true,
            isMuted = true,
        )
        assertThat(h).isWithin(1e-9).of(0.05)
    }

    // MARK: - Recency buckets (isolated: unread 0, members 0, unpinned → heat == 0.40·recency)

    @Test
    fun `activity under five minutes is the hottest recency bucket`() {
        assertThat(heat(lastActivityMillis = secondsAgo(0))).isWithin(1e-9).of(0.40 * 1.0)
        assertThat(heat(lastActivityMillis = secondsAgo(299))).isWithin(1e-9).of(0.40 * 1.0)
    }

    @Test
    fun `activity under an hour is the second recency bucket`() {
        assertThat(heat(lastActivityMillis = secondsAgo(1_000))).isWithin(1e-9).of(0.40 * 0.8)
    }

    @Test
    fun `activity under a day is the third recency bucket`() {
        assertThat(heat(lastActivityMillis = secondsAgo(4_000))).isWithin(1e-9).of(0.40 * 0.5)
    }

    @Test
    fun `activity under a week is the fourth recency bucket`() {
        assertThat(heat(lastActivityMillis = secondsAgo(100_000))).isWithin(1e-9).of(0.40 * 0.2)
    }

    @Test
    fun `activity older than a week has no recency heat`() {
        assertThat(heat(lastActivityMillis = secondsAgo(700_000))).isWithin(1e-9).of(0.0)
    }

    @Test
    fun `an absent last-activity instant is treated as coldest`() {
        assertThat(heat(lastActivityMillis = null)).isWithin(1e-9).of(0.0)
    }

    @Test
    fun `a future last-activity instant from clock skew stays in the hottest bucket`() {
        assertThat(heat(lastActivityMillis = now + 60_000L)).isWithin(1e-9).of(0.40 * 1.0)
    }

    // MARK: - Recency boundaries prove the exclusive `<` edges (not `<=`)

    @Test
    fun `exactly five minutes drops out of the hottest bucket`() {
        assertThat(heat(lastActivityMillis = secondsAgo(300))).isWithin(1e-9).of(0.40 * 0.8)
    }

    @Test
    fun `exactly one hour drops to the third bucket`() {
        assertThat(heat(lastActivityMillis = secondsAgo(3_600))).isWithin(1e-9).of(0.40 * 0.5)
    }

    @Test
    fun `exactly one day drops to the fourth bucket`() {
        assertThat(heat(lastActivityMillis = secondsAgo(86_400))).isWithin(1e-9).of(0.40 * 0.2)
    }

    @Test
    fun `exactly one week drops to no recency heat`() {
        assertThat(heat(lastActivityMillis = secondsAgo(604_800))).isWithin(1e-9).of(0.0)
    }

    // MARK: - Unread term (0.35 weight, capped at 10 unread)

    @Test
    fun `unread contributes proportionally up to ten messages`() {
        // old (recency 0), members 0, unpinned → heat == 0.35·min(unread/10,1)
        assertThat(heat(lastActivityMillis = secondsAgo(700_000), unreadCount = 5))
            .isWithin(1e-9).of(0.35 * 0.5)
    }

    @Test
    fun `unread heat caps at ten messages`() {
        assertThat(heat(lastActivityMillis = secondsAgo(700_000), unreadCount = 100))
            .isWithin(1e-9).of(0.35 * 1.0)
    }

    // MARK: - Members term (0.15 weight, capped at 50 members)

    @Test
    fun `member count contributes proportionally up to fifty members`() {
        assertThat(heat(lastActivityMillis = secondsAgo(700_000), memberCount = 25))
            .isWithin(1e-9).of(0.15 * 0.5)
    }

    @Test
    fun `member heat caps at fifty members`() {
        assertThat(heat(lastActivityMillis = secondsAgo(700_000), memberCount = 100))
            .isWithin(1e-9).of(0.15 * 1.0)
    }

    // MARK: - Pinned term (0.10 weight)

    @Test
    fun `pinning adds a fixed tenth of heat`() {
        assertThat(heat(lastActivityMillis = secondsAgo(700_000), isPinned = true))
            .isWithin(1e-9).of(0.10)
    }

    // MARK: - Combination

    @Test
    fun `every signal maxed sums to exactly one`() {
        val h = heat(
            lastActivityMillis = secondsAgo(0),
            unreadCount = 10,
            memberCount = 50,
            isPinned = true,
        )
        assertThat(h).isWithin(1e-9).of(1.0)
    }

    @Test
    fun `a realistic active-group blend combines every weighted term`() {
        // recency 0.8 (1000s), unread 3 → 0.3, members 10 → 0.2, pinned
        val h = heat(
            lastActivityMillis = secondsAgo(1_000),
            unreadCount = 3,
            memberCount = 10,
            isPinned = true,
        )
        val expected = 0.40 * 0.8 + 0.35 * 0.3 + 0.15 * 0.2 + 0.10 * 1.0
        assertThat(h).isWithin(1e-9).of(expected)
    }

    // MARK: - Gradient opacity ramp (iOS heatBackground)

    @Test
    fun `dark gradient ramps from a raised floor`() {
        val cold = ConversationActivityHeat.gradient(heat = 0.0, isDark = true)
        assertThat(cold.topOpacity).isWithin(1e-6f).of(0.03f)
        assertThat(cold.bottomOpacity).isWithin(1e-6f).of(0.03f * 0.25f)

        val hot = ConversationActivityHeat.gradient(heat = 1.0, isDark = true)
        assertThat(hot.topOpacity).isWithin(1e-6f).of(0.13f)
        assertThat(hot.bottomOpacity).isWithin(1e-6f).of(0.13f * 0.25f)
    }

    @Test
    fun `light gradient ramps from a lower floor than dark`() {
        val cold = ConversationActivityHeat.gradient(heat = 0.0, isDark = false)
        assertThat(cold.topOpacity).isWithin(1e-6f).of(0.02f)
        assertThat(cold.bottomOpacity).isWithin(1e-6f).of(0.02f * 0.25f)

        val hot = ConversationActivityHeat.gradient(heat = 1.0, isDark = false)
        assertThat(hot.topOpacity).isWithin(1e-6f).of(0.10f)
        assertThat(hot.bottomOpacity).isWithin(1e-6f).of(0.10f * 0.25f)
    }

    @Test
    fun `the bottom opacity is always a quarter of the top`() {
        val g = ConversationActivityHeat.gradient(heat = 0.5, isDark = true)
        assertThat(g.bottomOpacity).isWithin(1e-6f).of(g.topOpacity * 0.25f)
    }

    // MARK: - of(conversation, now) convenience over a real ApiConversation

    private fun conversation(
        lastMessageIso: String? = null,
        updatedAtIso: String? = null,
        unreadCount: Int = 0,
        participantCount: Int = 0,
        isPinned: Boolean = false,
        isMuted: Boolean = false,
    ) = ApiConversation(
        id = "c1",
        participants = List(participantCount) { ApiParticipant(id = "p$it", userId = "u$it") },
        lastMessage = lastMessageIso?.let { ApiConversationLastMessage(createdAt = it) },
        unreadCount = unreadCount,
        updatedAt = updatedAtIso,
        preferences = ApiConversationPreferences(isPinned = isPinned, isMuted = isMuted),
    )

    @Test
    fun `of reads every heat signal off a real conversation`() {
        // 2026-07-13T12:00:00Z last message; "now" = 1000s later
        val lastIso = "2026-07-13T12:00:00Z"
        val lastMillis = 1_783_944_000_000L
        val convNow = lastMillis + 1_000_000L // 1000s later → recency 0.8
        val c = conversation(
            lastMessageIso = lastIso,
            unreadCount = 3,
            participantCount = 10,
            isPinned = true,
        )
        val expected = 0.40 * 0.8 + 0.35 * 0.3 + 0.15 * 0.2 + 0.10 * 1.0
        assertThat(ConversationActivityHeat.of(c, convNow)).isWithin(1e-9).of(expected)
    }

    @Test
    fun `of short-circuits a muted conversation to the cold floor`() {
        val c = conversation(
            lastMessageIso = "2026-07-13T12:00:00Z",
            unreadCount = 100,
            participantCount = 100,
            isPinned = true,
            isMuted = true,
        )
        assertThat(ConversationActivityHeat.of(c, 1_783_944_000_001L)).isWithin(1e-9).of(0.05)
    }

    @Test
    fun `of treats a conversation with no parseable timestamp as coldest recency`() {
        val c = conversation(lastMessageIso = null, updatedAtIso = null, unreadCount = 0)
        assertThat(ConversationActivityHeat.of(c, now)).isWithin(1e-9).of(0.0)
    }
}
