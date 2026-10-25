package me.meeshy.app.navigation

import com.google.common.truth.Truth.assertThat
import java.time.Instant
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.emptyFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.flow
import kotlinx.coroutines.flow.flowOf
import kotlinx.coroutines.flow.toList
import kotlinx.coroutines.test.runTest
import me.meeshy.sdk.model.PresenceState
import me.meeshy.sdk.model.StatusEntry
import me.meeshy.sdk.model.StoryGroup
import me.meeshy.sdk.model.StoryItem
import me.meeshy.sdk.model.UserStatusEvent
import me.meeshy.ui.component.StoryRingState
import me.meeshy.ui.component.meeshyPresenceDotColor
import org.junit.Test

class ProfileSheetEnvironmentImplTest {

    private val now = Instant.parse("2026-10-24T12:00:00Z").toEpochMilli()
    private fun iso(offsetSeconds: Long): String = Instant.ofEpochMilli(now + offsetSeconds * 1_000L).toString()

    private fun impl(
        presence: Flow<UserStatusEvent> = emptyFlow(),
        groups: Flow<List<StoryGroup>> = emptyFlow(),
        moods: List<StatusEntry> = emptyList(),
    ) = ProfileSheetEnvironmentImpl(ProfileLiveSources(presence, groups, { moods }, { now }))

    private fun activeGroup(userId: String, viewed: Boolean) = StoryGroup(
        id = userId,
        stories = listOf(StoryItem(id = "story-$userId", createdAt = iso(-3_600), expiresAt = iso(3_600), isViewed = viewed)),
    )

    @Test
    fun `la presence temps reel gagne sur le cliche REST`() = runTest {
        val presence = MutableSharedFlow<UserStatusEvent>(replay = 1)
        presence.emit(UserStatusEvent(userId = "bob", isOnline = true, lastActiveAt = iso(-5)))

        val signs = impl(presence = presence).signsFor("bob").first { it.livePresence != null }

        assertThat(signs.presence(restIsOnline = false, restLastActiveAt = iso(-7_200), nowEpochMillis = now))
            .isEqualTo(PresenceState.ONLINE)
    }

    @Test
    fun `la presence d'une autre personne ne touche pas la fiche`() = runTest {
        val presence = flowOf(UserStatusEvent(userId = "eve", isOnline = true, lastActiveAt = iso(0)))

        val all = impl(presence = presence).signsFor("bob").toList()

        assertThat(all.map { it.livePresence }).containsExactly(null)
    }

    @Test
    fun `sans presence servie aucun point`() = runTest {
        val signs = impl().signsFor("bob").first()

        val state = signs.presence(restIsOnline = null, restLastActiveAt = null, nowEpochMillis = now)
        assertThat(state).isNull()
        assertThat(meeshyPresenceDotColor(state)).isNull()
        assertThat(signs.presenceLine(restIsOnline = null, restLastActiveAt = null, nowEpochMillis = now)).isNull()
    }

    @Test
    fun `sans temps reel le cliche REST decide`() = runTest {
        val signs = impl().signsFor("bob").first()

        assertThat(signs.presence(restIsOnline = false, restLastActiveAt = iso(-120), nowEpochMillis = now))
            .isEqualTo(PresenceState.AWAY)
    }

    @Test
    fun `l'anneau et l'humeur sont ceux de la personne montree`() = runTest {
        val sources = impl(
            groups = flowOf(listOf(activeGroup("bob", viewed = false), activeGroup("ana", viewed = true))),
            moods = listOf(
                StatusEntry(id = "s1", userId = "bob", moodEmoji = "😀", content = "En forme"),
                StatusEntry(id = "s2", userId = "ana", moodEmoji = ""),
            ),
        )

        val bob = sources.signsFor("bob").toList().last()
        val ana = sources.signsFor("ana").toList().last()
        val eve = sources.signsFor("eve").toList().last()

        assertThat(bob.storyRing).isEqualTo(StoryRingState.Unread)
        assertThat(bob.moodEmoji).isEqualTo("😀")
        assertThat(bob.moodText).isEqualTo("En forme")
        assertThat(ana.storyRing).isEqualTo(StoryRingState.Read)
        assertThat(ana.moodEmoji).isNull()
        assertThat(eve.storyRing).isEqualTo(StoryRingState.None)
        assertThat(eve.moodEmoji).isNull()
    }

    @Test
    fun `une source de stories en panne n'eteint pas la presence`() = runTest {
        val presence = MutableSharedFlow<UserStatusEvent>(replay = 1)
        presence.emit(UserStatusEvent(userId = "bob", isOnline = true, lastActiveAt = iso(0)))
        val broken = flow<List<StoryGroup>> { error("room") }

        val signs = impl(presence = presence, groups = broken).signsFor("bob").first { it.livePresence != null }

        assertThat(signs.storyRing).isEqualTo(StoryRingState.None)
    }
}
