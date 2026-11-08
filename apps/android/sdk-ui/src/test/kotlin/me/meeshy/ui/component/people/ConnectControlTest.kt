package me.meeshy.ui.component.people

import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.assertIsEnabled
import androidx.compose.ui.test.assertIsNotEnabled
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.performClick
import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.friend.ConnectAction
import me.meeshy.ui.theme.MeeshyTheme
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class ConnectControlTest {

    @get:Rule
    val compose = createComposeRule()

    private val calls = mutableListOf<String>()

    private fun show(action: ConnectAction, busy: Boolean = false) {
        compose.setContent {
            MeeshyTheme {
                ConnectControl(
                    action = action,
                    userName = "Alice",
                    onAdd = { calls += "add" },
                    onAccept = { calls += "accept" },
                    onDecline = { calls += "decline" },
                    onCancel = { calls += "cancel" },
                    busy = busy,
                )
            }
        }
        compose.waitForIdle()
    }

    @Test
    fun `connect offers to add`() {
        show(ConnectAction.Connect)

        compose.onNodeWithContentDescription("Add — Alice").assertIsDisplayed().performClick()
        assertThat(calls).containsExactly("add")
    }

    @Test
    fun `pending offers to cancel the sent request`() {
        show(ConnectAction.Pending)

        compose.onNodeWithContentDescription("Cancel request — Alice").assertIsDisplayed().performClick()
        assertThat(calls).containsExactly("cancel")
    }

    @Test
    fun `accept offers accept and decline`() {
        show(ConnectAction.Accept("r1"))

        compose.onNodeWithContentDescription("Accept — Alice").performClick()
        compose.onNodeWithContentDescription("Decline — Alice").performClick()
        assertThat(calls).containsExactly("accept", "decline").inOrder()
    }

    @Test
    fun `contact and blocked are read-only badges`() {
        show(ConnectAction.Contact)
        compose.onNodeWithContentDescription("Contact").assertIsDisplayed()
    }

    @Test
    fun `blocked renders the blocked badge`() {
        show(ConnectAction.Blocked)
        compose.onNodeWithContentDescription("Blocked").assertIsDisplayed()
    }

    @Test
    fun `hidden renders nothing`() {
        show(ConnectAction.Hidden)

        compose.onNodeWithContentDescription("Add — Alice").assertDoesNotExist()
        compose.onNodeWithContentDescription("Contact").assertDoesNotExist()
        compose.onNodeWithContentDescription("Blocked").assertDoesNotExist()
    }

    @Test
    fun `busy disables the control`() {
        show(ConnectAction.Connect, busy = true)

        compose.onNodeWithContentDescription("Add — Alice").assertIsNotEnabled()
    }

    @Test
    fun `idle keeps the control enabled`() {
        show(ConnectAction.Connect, busy = false)

        compose.onNodeWithContentDescription("Add — Alice").assertIsEnabled()
    }
}
