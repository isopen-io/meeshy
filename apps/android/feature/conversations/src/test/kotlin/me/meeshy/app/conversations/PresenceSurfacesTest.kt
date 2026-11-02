package me.meeshy.app.conversations

import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithText
import io.mockk.every
import io.mockk.mockk
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.flow
import kotlinx.coroutines.flow.flowOf
import me.meeshy.sdk.model.ApiConversation
import me.meeshy.sdk.model.ApiParticipant
import me.meeshy.sdk.model.PresenceState
import me.meeshy.sdk.model.UserPresence
import me.meeshy.sdk.net.api.UserSearchResult
import me.meeshy.sdk.socket.PresenceStore
import me.meeshy.ui.component.LocalPresenceStore
import me.meeshy.ui.component.presenceDotTag
import me.meeshy.ui.theme.MeeshyTheme
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import androidx.compose.ui.test.onNodeWithTag

/**
 * Nouvelle conversation et Recherche globale montrent la présence VIVANTE : le point est celui de
 * `rememberPresence(id, présence servie)`, il passe du vert à l'orange avec la seule horloge
 * partagée (aucun événement), et une ligne qui ne sert rien n'a aucun point (#13743).
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class PresenceSurfacesTest {

    @get:Rule
    val compose = createComposeRule()

    private var nowMillis = 1_700_000_000_000L
    private val ticks = MutableSharedFlow<Unit>(extraBufferCapacity = 8)

    private fun iso(epochMillis: Long): String = java.time.Instant.ofEpochMilli(epochMillis).toString()

    /** Le contrat de [PresenceStore] pour une présence servie : l'état se recalcule à chaque battement. */
    private fun store(live: Map<String, UserPresence> = emptyMap()): PresenceStore = mockk {
        fun entry(id: String, served: UserPresence?) = live[id] ?: served
        every { currentStateOf(any(), any()) } answers {
            entry(firstArg(), secondArg())?.state(nowMillis)
        }
        every { presenceOf(any(), any()) } answers {
            val presence = entry(firstArg(), secondArg())
            states(presence)
        }
        every { presenceOf(any()) } answers { states(live[firstArg<String>()]) }
    }

    private fun states(presence: UserPresence?): Flow<PresenceState?> =
        if (presence == null) flowOf(null)
        else flow {
            emit(presence.state(nowMillis))
            ticks.collect { emit(presence.state(nowMillis)) }
        }.distinctUntilChanged()

    private fun show(store: PresenceStore, content: @androidx.compose.runtime.Composable () -> Unit) {
        compose.setContent {
            MeeshyTheme { CompositionLocalProvider(LocalPresenceStore provides store) { content() } }
        }
    }

    private fun assertDot(state: PresenceState) =
        compose.onNodeWithTag(presenceDotTag(state), useUnmergedTree = true).assertExists()

    private fun assertNoDot() {
        PresenceState.values().forEach { compose.onNodeWithTag(presenceDotTag(it), useUnmergedTree = true).assertDoesNotExist() }
    }

    private fun tick(elapsedMillis: Long) {
        nowMillis += elapsedMillis
        ticks.tryEmit(Unit)
        compose.waitForIdle()
    }

    private fun candidate(lastActiveAt: String? = iso(nowMillis - 10_000), isOnline: Boolean = false) =
        SelectableUser(id = "u1", displayName = "Alice", username = "alice", avatarUrl = null, isOnline = isOnline, lastActiveAt = lastActiveAt)

    @Test
    fun `nouvelle conversation - le point passe du vert a l'orange sans evenement`() {
        show(store()) { UserRow(user = candidate(), onClick = {}) }

        assertDot(PresenceState.ONLINE)
        tick(100_000)
        assertDot(PresenceState.AWAY)
    }

    @Test
    fun `nouvelle conversation - un utilisateur non servi n'a aucun point`() {
        show(store()) { UserRow(user = candidate(lastActiveAt = null), onClick = {}) }

        assertNoDot()
    }

    @Test
    fun `nouvelle conversation - la carte vivante l'emporte sur la ligne servie`() {
        show(store(live = mapOf("u1" to UserPresence(isOnline = true)))) {
            UserRow(user = candidate(lastActiveAt = null), onClick = {})
        }

        assertDot(PresenceState.ONLINE)
    }

    @Test
    fun `recherche - un utilisateur passe du vert a l'orange et son En ligne s'eteint`() {
        val user = UserSearchResult(id = "u1", username = "alice", displayName = "Alice", lastActiveAt = iso(nowMillis - 10_000))
        show(store()) { UserHitRow(user = user, onClick = {}) }

        assertDot(PresenceState.ONLINE)
        compose.onNodeWithText("Online", substring = true, ignoreCase = true).assertExists()
        tick(100_000)
        assertDot(PresenceState.AWAY)
        compose.onNodeWithText("Online", substring = true, ignoreCase = true).assertDoesNotExist()
    }

    @Test
    fun `recherche - un utilisateur non servi n'a ni point ni En ligne`() {
        val user = UserSearchResult(id = "u1", username = "alice", displayName = "Alice")
        show(store()) { UserHitRow(user = user, onClick = {}) }

        assertNoDot()
        compose.onNodeWithText("Online", substring = true, ignoreCase = true).assertDoesNotExist()
    }

    @Test
    fun `recherche - une conversation directe porte le point vivant de son interlocuteur`() {
        val direct = ApiConversation(
            id = "c1",
            type = "direct",
            participants = listOf(
                ApiParticipant(id = "p-me", userId = "me", displayName = "Me"),
                ApiParticipant(id = "p-u1", userId = "u1", displayName = "Alice"),
            ),
        )
        show(store(live = mapOf("u1" to UserPresence(isOnline = false, lastActiveAt = iso(nowMillis - 10_000))))) {
            ConversationHitRow(conversation = direct, currentUserId = "me", onClick = {})
        }

        assertDot(PresenceState.ONLINE)
        tick(100_000)
        assertDot(PresenceState.AWAY)
    }

    @Test
    fun `recherche - un groupe n'a aucun point`() {
        val group = ApiConversation(
            id = "c2",
            type = "group",
            title = "Team",
            participants = listOf(
                ApiParticipant(id = "p-me", userId = "me", displayName = "Me"),
                ApiParticipant(id = "p-u1", userId = "u1", displayName = "Alice"),
                ApiParticipant(id = "p-u2", userId = "u2", displayName = "Bob"),
            ),
        )
        show(store(live = mapOf("u1" to UserPresence(isOnline = true), "u2" to UserPresence(isOnline = true)))) {
            ConversationHitRow(conversation = group, currentUserId = "me", onClick = {})
        }

        assertNoDot()
    }
}
