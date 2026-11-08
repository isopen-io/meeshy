package me.meeshy.app.contacts

import androidx.compose.ui.test.assertHeightIsAtLeast
import androidx.compose.ui.test.assertWidthIsAtLeast
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.unit.dp
import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.FriendRequest
import me.meeshy.sdk.model.FriendRequestUser
import me.meeshy.ui.theme.MeeshyTheme
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class RequestRowsTest {

    @get:Rule
    val compose = createComposeRule()

    private fun received(message: String? = null) = FriendRequest(
        id = "r1",
        senderId = "alice",
        status = "pending",
        message = message,
        sender = FriendRequestUser(id = "alice", username = "alice", displayName = "Alice"),
    )

    private fun sent() = FriendRequest(
        id = "s1",
        receiverId = "bob",
        status = "pending",
        receiver = FriendRequestUser(id = "bob", username = "bob", displayName = "Bob"),
    )

    private fun state(direction: RequestsDirection, vararg rows: FriendRequest) = RequestsUiState(
        direction = direction,
        received = RequestsListState(rows = rows.filter { it.senderId.isNotBlank() }, synced = true),
        sent = RequestsListState(rows = rows.filter { it.receiverId.isNotBlank() }, synced = true),
    )

    private fun show(
        state: RequestsUiState,
        onAccept: (String) -> Unit = {},
        onDecline: (String) -> Unit = {},
        onCancel: (String) -> Unit = {},
        onSelect: (RequestsDirection) -> Unit = {},
    ) {
        compose.setContent {
            MeeshyTheme {
                RequestsContent(
                    state = state,
                    onSelect = onSelect,
                    onAccept = onAccept,
                    onDecline = onDecline,
                    onCancel = onCancel,
                    onRefresh = {},
                    onLoadMore = {},
                    onOpenProfile = {},
                )
            }
        }
    }

    @Test
    fun `the received row speaks its two actions to TalkBack and reports them`() {
        var accepted: String? = null
        var declined: String? = null
        show(state(RequestsDirection.Received, received()), onAccept = { accepted = it }, onDecline = { declined = it })

        compose.onNodeWithContentDescription("Accept request from Alice").performClick()
        compose.onNodeWithContentDescription("Decline request from Alice").performClick()

        assertThat(accepted).isEqualTo("r1")
        assertThat(declined).isEqualTo("r1")
    }

    @Test
    fun `the two round buttons are at least 44 dp`() {
        show(state(RequestsDirection.Received, received()))

        compose.onNodeWithContentDescription("Accept request from Alice").assertWidthIsAtLeast(44.dp).assertHeightIsAtLeast(44.dp)
        compose.onNodeWithContentDescription("Decline request from Alice").assertWidthIsAtLeast(44.dp).assertHeightIsAtLeast(44.dp)
    }

    @Test
    fun `a request without a note states the default intent`() {
        show(state(RequestsDirection.Received, received()))
        compose.onNodeWithText("Wants to connect with you").assertExists()
    }

    @Test
    fun `a personal note replaces the default intent`() {
        show(state(RequestsDirection.Received, received(message = "On s'est vus hier")))

        compose.onNodeWithText("On s'est vus hier").assertExists()
        compose.onNodeWithText("Wants to connect with you").assertDoesNotExist()
    }

    @Test
    fun `the sent row shows the pending capsule and cancels`() {
        var cancelled: String? = null
        show(state(RequestsDirection.Sent, sent()), onCancel = { cancelled = it })

        compose.onNodeWithText("Pending").assertExists()
        compose.onNodeWithContentDescription("Cancel request sent to Bob").performClick()

        assertThat(cancelled).isEqualTo("s1")
    }

    @Test
    fun `the pills carry the counts and each direction has its own empty state`() {
        var chosen: RequestsDirection? = null
        show(state(RequestsDirection.Received, received()), onSelect = { chosen = it })

        compose.onNodeWithText("Received (1)").assertExists()
        compose.onNodeWithText("Sent (0)").performClick()

        assertThat(chosen).isEqualTo(RequestsDirection.Sent)
    }

    @Test
    fun `an empty received direction is illustrated and explained`() {
        show(state(RequestsDirection.Received))

        compose.onNodeWithText("No requests received").assertExists()
        compose.onNodeWithText("Contact requests you receive will appear here").assertExists()
    }

    @Test
    fun `an empty sent direction is illustrated and explained`() {
        show(state(RequestsDirection.Sent))

        compose.onNodeWithText("No requests sent").assertExists()
    }
}
