package me.meeshy.app.conversations

import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.ui.test.assertHasClickAction
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onAllNodesWithContentDescription
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import io.mockk.every
import io.mockk.mockk
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.flowOf
import me.meeshy.sdk.model.PresenceState
import me.meeshy.sdk.model.UserPresence
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
 * Les puces des participants choisis portent l'avatar et la présence vivante, comme iOS
 * (`selectedUserChip`, #13758) : un point pour une présence servie, aucun sinon, la carte
 * vivante l'emporte, et toucher la croix retire le participant.
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class SelectedChipsPresenceTest {

    @get:Rule
    val compose = createComposeRule()

    private val nowMillis = 1_700_000_000_000L

    private fun iso(epochMillis: Long): String = java.time.Instant.ofEpochMilli(epochMillis).toString()

    private fun store(live: Map<String, UserPresence> = emptyMap()): PresenceStore = mockk {
        fun entry(id: String, served: UserPresence?) = live[id] ?: served
        every { currentStateOf(any(), any()) } answers { entry(firstArg(), secondArg())?.state(nowMillis) }
        every { presenceOf(any(), any()) } answers { states(entry(firstArg(), secondArg())) }
        every { presenceOf(any()) } answers { states(live[firstArg<String>()]) }
    }

    private fun states(presence: UserPresence?): Flow<PresenceState?> = flowOf(presence?.state(nowMillis))

    private fun show(store: PresenceStore, selected: List<SelectableUser>, onRemove: (String) -> Unit = {}) {
        compose.setContent {
            MeeshyTheme {
                CompositionLocalProvider(LocalPresenceStore provides store) {
                    SelectedChips(selected = selected, onRemove = onRemove)
                }
            }
        }
    }

    private fun chosen(id: String = "u1", name: String = "Alice", lastActiveAt: String? = iso(nowMillis - 10_000)) =
        SelectableUser(id = id, displayName = name, username = name.lowercase(), avatarUrl = null, isOnline = false, lastActiveAt = lastActiveAt, isSelected = true)

    private fun assertNoDot() {
        PresenceState.values().forEach { compose.onNodeWithTag(presenceDotTag(it), useUnmergedTree = true).assertDoesNotExist() }
    }

    @Test
    fun `une puce dont la presence est servie porte le point vivant`() {
        show(store(), listOf(chosen()))

        compose.onNodeWithTag(presenceDotTag(PresenceState.ONLINE), useUnmergedTree = true).assertExists()
        compose.onNodeWithText("Alice").assertExists()
    }

    @Test
    fun `une puce sans presence servie n'a aucun point`() {
        show(store(), listOf(chosen(lastActiveAt = null)))

        assertNoDot()
    }

    @Test
    fun `la carte vivante l'emporte sur la presence servie de la puce`() {
        show(store(live = mapOf("u1" to UserPresence(isOnline = true))), listOf(chosen(lastActiveAt = null)))

        compose.onNodeWithTag(presenceDotTag(PresenceState.ONLINE), useUnmergedTree = true).assertExists()
    }

    @Test
    fun `toucher la croix retire ce participant`() {
        val removed = mutableListOf<String>()
        show(store(), listOf(chosen("u1", "Alice"), chosen("u2", "Bob")), onRemove = { removed += it })

        compose.onAllNodesWithContentDescription("Remove", useUnmergedTree = true)[1].performClick()

        assertThat(removed).containsExactly("u2")
    }

    @Test
    fun `la croix de retrait est annoncee et cliquable`() {
        show(store(), listOf(chosen()))

        compose.onNodeWithContentDescription("Remove", useUnmergedTree = true).assertHasClickAction()
    }

    private fun <T> assertThat(actual: List<T>) = com.google.common.truth.Truth.assertThat(actual)
}
