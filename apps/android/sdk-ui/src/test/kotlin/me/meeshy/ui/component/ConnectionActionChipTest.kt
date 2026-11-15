package me.meeshy.ui.component

import androidx.compose.ui.graphics.Color
import androidx.compose.ui.test.assertHeightIsAtLeast
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.assertWidthIsAtLeast
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.performClick
import androidx.compose.ui.unit.dp
import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.friend.ConnectionActionRender
import me.meeshy.ui.theme.MeeshyTheme
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class ConnectionActionChipTest {

    @get:Rule
    val compose = createComposeRule()

    private val calls = mutableListOf<String>()

    private fun show(render: ConnectionActionRender) {
        compose.setContent {
            MeeshyTheme {
                ConnectionActionChip(
                    render = render,
                    userName = "Alice",
                    accent = Color(0xFF123456),
                    onAdd = { calls += "add" },
                    onAccept = { calls += "accept" },
                    onDecline = { calls += "decline" },
                    onCancel = { calls += "cancel" },
                )
            }
        }
        compose.waitForIdle()
    }

    @Test
    fun `self renders no node at all`() {
        show(ConnectionActionRender.Hidden)

        compose.onNodeWithContentDescription("Add — Alice").assertDoesNotExist()
        compose.onNodeWithContentDescription("Blocked").assertDoesNotExist()
        compose.onNodeWithContentDescription("Contact").assertDoesNotExist()
    }

    @Test
    fun `blocked renders a read-only badge`() {
        show(ConnectionActionRender.BlockedBadge)

        compose.onNodeWithContentDescription("Blocked").assertIsDisplayed()
    }

    @Test
    fun `a contact renders the contact badge`() {
        show(ConnectionActionRender.ContactBadge)

        compose.onNodeWithContentDescription("Contact").assertIsDisplayed()
    }

    @Test
    fun `none renders the add capsule that sends`() {
        show(ConnectionActionRender.Add)

        compose.onNodeWithContentDescription("Add — Alice")
            .assertIsDisplayed()
            .assertHeightIsAtLeast(44.dp)
            .performClick()
        assertThat(calls).containsExactly("add")
    }

    @Test
    fun `a sent request renders the pending capsule that cancels`() {
        show(ConnectionActionRender.PendingSent)

        compose.onNodeWithContentDescription("Cancel request — Alice")
            .assertIsDisplayed()
            .assertHeightIsAtLeast(44.dp)
            .performClick()
        assertThat(calls).containsExactly("cancel")
    }

    @Test
    fun `a received request renders two 44 dp round buttons`() {
        show(ConnectionActionRender.AcceptDecline("r1"))

        compose.onNodeWithContentDescription("Decline — Alice")
            .assertHeightIsAtLeast(44.dp).assertWidthIsAtLeast(44.dp).performClick()
        compose.onNodeWithContentDescription("Accept — Alice")
            .assertHeightIsAtLeast(44.dp).assertWidthIsAtLeast(44.dp).performClick()
        assertThat(calls).containsExactly("decline", "accept").inOrder()
    }

    @Test
    fun `the add capsule takes the accent of its context`() {
        val accent = Color(0xFF00AA55)

        assertThat(addCapsuleColor(accent)).isEqualTo(accent)
    }
}
