package me.meeshy.app.widget

import app.cash.turbine.test
import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.test.runTest
import me.meeshy.sdk.model.ApiConversation
import me.meeshy.sdk.model.ApiConversationPreferences
import me.meeshy.sdk.model.ApiParticipant
import me.meeshy.sdk.model.PresenceState
import me.meeshy.sdk.model.UserPresence
import me.meeshy.sdk.model.presence.PresenceMap
import org.junit.Test

/**
 * Ce que les widgets savent de la présence : l'état SERVI par la carte vivante de l'app, rien
 * d'autre (#13747). Un pair que la carte ne connaît pas n'a aucune entrée, donc aucun point.
 */
@OptIn(ExperimentalCoroutinesApi::class)
class WidgetPresenceTiersTest {

    private val now = 1_700_000_000_000L

    private fun iso(epochMillis: Long): String = java.time.Instant.ofEpochMilli(epochMillis).toString()

    private fun activeAgo(millis: Long, online: Boolean = false) =
        UserPresence(isOnline = online, lastActiveAt = iso(now - millis))

    private fun conversation(id: String, type: String = "direct", pinned: Boolean = false) = ApiConversation(
        id = id,
        type = type,
        participants = listOf(
            ApiParticipant(id = "p-me", userId = "me", displayName = "Me"),
            ApiParticipant(id = "p-$id", userId = "peer-$id", displayName = "Contact $id"),
        ),
        preferences = ApiConversationPreferences(isPinned = pinned),
    )

    @Test
    fun `a served entry resolves to the 1-3-5 state at the reference clock`() {
        val entries: PresenceMap = mapOf(
            "on" to activeAgo(30_000),
            "away" to activeAgo(120_000),
            "idle" to activeAgo(240_000),
            "off" to activeAgo(400_000),
        )

        val tiers = WidgetPresenceTiers.tiers(entries, setOf("on", "away", "idle", "off"), now)

        assertThat(tiers).containsExactly(
            "on", PresenceState.ONLINE,
            "away", PresenceState.AWAY,
            "idle", PresenceState.IDLE,
            "off", PresenceState.OFFLINE,
        )
    }

    @Test
    fun `a peer the live map does not know has no tier, nothing is fabricated`() {
        val tiers = WidgetPresenceTiers.tiers(mapOf("known" to activeAgo(1_000)), setOf("known", "stranger"), now)

        assertThat(tiers.keys).containsExactly("known")
    }

    @Test
    fun `entries of people the widgets do not show are left out`() {
        val tiers = WidgetPresenceTiers.tiers(mapOf("shown" to activeAgo(1_000), "other" to activeAgo(1_000)), setOf("shown"), now)

        assertThat(tiers.keys).containsExactly("shown")
    }

    @Test
    fun `displayed peers are the favorites and the recent direct conversations, never a group`() {
        val conversations = listOf(
            conversation("fav", pinned = true),
            conversation("group", type = "group", pinned = true),
            conversation("recent"),
        )

        val peers = WidgetPresenceTiers.displayedPeerIds(conversations, "me")

        assertThat(peers).containsExactly("peer-fav", "peer-recent")
    }

    @Test
    fun `a tier that does not change emits nothing, a tier that changes emits once`() = runTest {
        val entries = MutableStateFlow<PresenceMap>(mapOf("a" to activeAgo(10_000)))
        val ticks = MutableSharedFlow<Unit>()
        var clock = now

        WidgetPresenceTiers.changes(MutableStateFlow(setOf("a")), entries, ticks) { clock }.test {
            assertThat(awaitItem()).containsExactly("a", PresenceState.ONLINE)

            clock += 20_000
            ticks.emit(Unit)
            expectNoEvents()

            entries.value = mapOf("a" to activeAgo(12_000))
            expectNoEvents()

            clock += 60_000
            ticks.emit(Unit)
            assertThat(awaitItem()).containsExactly("a", PresenceState.AWAY)
            cancelAndIgnoreRemainingEvents()
        }
    }

    @Test
    fun `clearing the map on an account switch clears the tiers`() = runTest {
        val entries = MutableStateFlow<PresenceMap>(mapOf("a" to activeAgo(10_000, online = true)))

        WidgetPresenceTiers.changes(MutableStateFlow(setOf("a")), entries, MutableSharedFlow()) { now }.test {
            assertThat(awaitItem()).containsExactly("a", PresenceState.ONLINE)

            entries.value = emptyMap()

            assertThat(awaitItem()).isEmpty()
            cancelAndIgnoreRemainingEvents()
        }
    }

    @Test
    fun `a new peer set re-reads the tiers of the new people only`() = runTest {
        val entries = MutableStateFlow<PresenceMap>(mapOf("a" to activeAgo(10_000), "b" to activeAgo(100_000)))
        val peers = MutableStateFlow(setOf("a"))

        WidgetPresenceTiers.changes(peers, entries, MutableSharedFlow()) { now }.test {
            assertThat(awaitItem()).containsExactly("a", PresenceState.ONLINE)

            peers.value = setOf("a", "b")

            assertThat(awaitItem()).containsExactly("a", PresenceState.ONLINE, "b", PresenceState.AWAY)
            cancelAndIgnoreRemainingEvents()
        }
    }
}
