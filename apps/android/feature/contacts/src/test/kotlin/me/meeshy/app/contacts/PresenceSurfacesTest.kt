package me.meeshy.app.contacts

import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithTag
import io.mockk.every
import io.mockk.mockk
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.flow
import kotlinx.coroutines.flow.flowOf
import me.meeshy.sdk.model.FriendRequestUser
import me.meeshy.sdk.model.PresenceState
import me.meeshy.sdk.model.UserPresence
import me.meeshy.sdk.model.friend.ConnectAction
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

/**
 * Contacts et Découvrir montrent la présence VIVANTE : le point est celui de
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
    private fun store(): PresenceStore = mockk {
        every { currentStateOf(any(), any()) } answers { secondArg<UserPresence?>()?.state(nowMillis) }
        every { presenceOf(any(), any()) } answers { states(secondArg()) }
        every { presenceOf(any()) } answers { states(null) }
    }

    private fun states(presence: UserPresence?): Flow<PresenceState?> =
        if (presence == null) flowOf(null)
        else flow {
            emit(presence.state(nowMillis))
            ticks.collect { emit(presence.state(nowMillis)) }
        }.distinctUntilChanged()

    private fun show(content: @androidx.compose.runtime.Composable () -> Unit) {
        compose.setContent {
            MeeshyTheme { CompositionLocalProvider(LocalPresenceStore provides store()) { content() } }
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

    @Test
    fun `contacts - le point passe du vert a l'orange sans evenement`() {
        val friend = FriendRequestUser(id = "u1", username = "alice", isOnline = false, lastActiveAt = iso(nowMillis - 10_000))
        show { FriendRow(friend = friend, moodEmoji = null, onClick = {}) }

        assertDot(PresenceState.ONLINE)
        tick(100_000)
        assertDot(PresenceState.AWAY)
        tick(100_000)
        assertDot(PresenceState.IDLE)
    }

    @Test
    fun `contacts - un ami dont rien n'est servi n'a aucun point`() {
        val friend = FriendRequestUser(id = "u1", username = "alice")
        show { FriendRow(friend = friend, moodEmoji = null, onClick = {}) }

        assertNoDot()
    }

    @Test
    fun `decouvrir - le point passe du vert a l'orange sans evenement`() {
        val user = UserSearchResult(id = "u1", username = "alice", isOnline = true, lastActiveAt = iso(nowMillis - 10_000))
        show {
            ResultRow(DiscoverRow(user, ConnectAction.Connect), {}, {}, {}, {}, {})
        }

        assertDot(PresenceState.ONLINE)
        tick(400_000)
        assertNoDot()
    }

    @Test
    fun `decouvrir - un utilisateur non servi n'a aucun point`() {
        val user = UserSearchResult(id = "u1", username = "alice")
        show {
            ResultRow(DiscoverRow(user, ConnectAction.Connect), {}, {}, {}, {}, {})
        }

        assertNoDot()
    }
}
