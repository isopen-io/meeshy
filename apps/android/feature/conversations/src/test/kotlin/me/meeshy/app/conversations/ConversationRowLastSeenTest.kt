package me.meeshy.app.conversations

import com.google.common.truth.Truth.assertThat
import java.time.Instant
import me.meeshy.sdk.model.PresenceLastSeen
import me.meeshy.sdk.model.PresenceState
import me.meeshy.sdk.model.UserPresence
import me.meeshy.sdk.model.avatar.ConversationHere
import org.junit.Test

/** Parité iOS `ThemedConversationRow` (`onOnlineTap`) et `MeeshyConversation.lastSeenLabel`. */
class ConversationRowLastSeenTest {

    private val now = 1_800_000_000_000L

    private fun active(agoMillis: Long) =
        UserPresence(isOnline = false, lastActiveAt = Instant.ofEpochMilli(now - agoMillis).toString())

    @Test
    fun `the tooltip stays up for two seconds, like iOS`() {
        assertThat(ConversationRowLastSeen.VISIBLE_MILLIS).isEqualTo(2_000L)
    }

    @Test
    fun `no entry or no activity date says nothing, absence of data is not rendered`() {
        assertThat(ConversationRowLastSeen.of(null, now)).isNull()
        assertThat(ConversationRowLastSeen.of(UserPresence(isOnline = true), now)).isNull()
    }

    @Test
    fun `under a minute reads online, then minutes, hours and days`() {
        assertThat(ConversationRowLastSeen.of(active(30_000L), now)).isEqualTo(PresenceLastSeen.Online)
        assertThat(ConversationRowLastSeen.of(active(5 * 60_000L), now)).isEqualTo(PresenceLastSeen.MinutesAgo(5))
        assertThat(ConversationRowLastSeen.of(active(3 * 3_600_000L), now)).isEqualTo(PresenceLastSeen.HoursAgo(3))
        assertThat(ConversationRowLastSeen.of(active(2 * 86_400_000L), now)).isEqualTo(PresenceLastSeen.DaysAgo(2))
    }

    @Test
    fun `a visible presence dot can be touched, online, away and idle alike`() {
        listOf(PresenceState.ONLINE, PresenceState.AWAY, PresenceState.IDLE).forEach {
            assertThat(ConversationRowLastSeen.dotIsTouchable(it, ConversationHere.ABSENT, moodEmoji = null)).isTrue()
        }
    }

    @Test
    fun `offline or unknown presence draws no dot, so nothing to touch`() {
        assertThat(ConversationRowLastSeen.dotIsTouchable(PresenceState.OFFLINE, ConversationHere.ABSENT, null)).isFalse()
        assertThat(ConversationRowLastSeen.dotIsTouchable(null, ConversationHere.ABSENT, null)).isFalse()
    }

    @Test
    fun `the here dot is touchable even without a served presence`() {
        assertThat(ConversationRowLastSeen.dotIsTouchable(null, ConversationHere.HERE, null)).isTrue()
    }

    @Test
    fun `a mood badge hides the dot, so there is nothing to touch`() {
        assertThat(ConversationRowLastSeen.dotIsTouchable(PresenceState.ONLINE, ConversationHere.ABSENT, "😀")).isFalse()
    }
}
