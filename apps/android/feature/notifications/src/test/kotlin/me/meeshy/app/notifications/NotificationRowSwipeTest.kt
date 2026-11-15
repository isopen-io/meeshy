package me.meeshy.app.notifications

import androidx.compose.ui.semantics.CustomAccessibilityAction
import androidx.compose.ui.semantics.SemanticsActions
import androidx.compose.ui.semantics.getOrNull
import androidx.compose.ui.test.SemanticsMatcher
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
class NotificationRowSwipeTest {

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

    private fun accessibilityLabels(isRead: Boolean): List<String> {
        compose.setContent {
            NotificationRow(
                notification = notification(isRead),
                isFriend = false,
                isConnectRequested = false,
                onOpen = {},
                onMarkRead = {},
                onDelete = {},
                onQuickAction = { _, _ -> },
            )
        }
        return compose.onAllNodes(SemanticsMatcher("has custom actions") {
            it.config.contains(SemanticsActions.CustomActions)
        }).fetchSemanticsNodes().flatMap { node ->
            node.config.getOrNull(SemanticsActions.CustomActions).orEmpty().map(CustomAccessibilityAction::label)
        }
    }

    @Test
    fun `an unread row reveals delete then read on the trailing edge`() {
        assertThat(accessibilityLabels(isRead = false)).containsExactly("Delete", "Mark read").inOrder()
    }

    @Test
    fun `a read row reveals delete only`() {
        assertThat(accessibilityLabels(isRead = true)).containsExactly("Delete")
    }

    @Test
    fun `the swipe actions are delete destructive first then read`() {
        val actions = notificationSwipeActions(isUnread = true, deleteLabel = "Delete", markReadLabel = "Mark read", onDelete = {}, onMarkRead = {})
        assertThat(actions.map { it.label }).containsExactly("Delete", "Mark read").inOrder()
        assertThat(notificationSwipeActions(isUnread = false, deleteLabel = "Delete", markReadLabel = "Mark read", onDelete = {}, onMarkRead = {}).map { it.label })
            .containsExactly("Delete")
    }
}
