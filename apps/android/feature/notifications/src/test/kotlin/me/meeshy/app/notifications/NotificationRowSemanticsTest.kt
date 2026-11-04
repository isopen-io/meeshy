package me.meeshy.app.notifications

import androidx.compose.ui.test.junit4.createComposeRule
import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.ApiNotification
import me.meeshy.sdk.model.NotificationActor
import me.meeshy.sdk.model.NotificationState
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34], qualifiers = "en-w360dp-h740dp-xxhdpi")
@GraphicsMode(GraphicsMode.Mode.NATIVE)
class NotificationRowSemanticsTest {

    @get:Rule
    val compose = createComposeRule()

    private fun notification(isRead: Boolean) = ApiNotification(
        id = "n1",
        type = "new_message",
        title = "Ana",
        content = "See you soon",
        actor = NotificationActor(id = "u1", username = "ana", displayName = "Ana"),
        state = NotificationState(isRead = isRead, createdAt = "2026-07-13T06:56:34Z"),
    )

    private fun show(notification: ApiNotification, onOpen: (ApiNotification) -> Unit = {}) = compose.setContent {
        NotificationRow(
            notification = notification,
            isFriend = false,
            isConnectRequested = false,
            onOpen = onOpen,
            onMarkRead = {},
            onDelete = {},
            onQuickAction = { _, _ -> },
        )
    }

    private fun described(prefix: String) = compose.onAllNodes(
        androidx.compose.ui.test.SemanticsMatcher("description starts with $prefix") {
            it.config.getOrNull(androidx.compose.ui.semantics.SemanticsProperties.ContentDescription)
                ?.any { d -> d.startsWith(prefix) } == true
        },
    ).fetchSemanticsNodes()

    @Test
    fun `an unread row is ONE node prefixed Unread with title and body`() {
        show(notification(isRead = false))
        val nodes = described("Unread. Ana. See you soon")
        assertThat(nodes).hasSize(1)
    }

    @Test
    fun `a read row carries no unread prefix`() {
        show(notification(isRead = true))
        assertThat(described("Unread.")).isEmpty()
        assertThat(described("Ana. See you soon")).hasSize(1)
    }
}
