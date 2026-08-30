package me.meeshy.app.notifications

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.ApiNotification
import me.meeshy.sdk.model.NotificationActor
import me.meeshy.sdk.model.NotificationContext
import org.junit.Test

/** The pure presentation projections the in-app toast mount reads (feature-parity §M). */
class NotificationToastHostTest {

    @Test
    fun senderName_prefersDisplayName() {
        val notification = ApiNotification(
            id = "n1",
            actor = NotificationActor(id = "u1", username = "alice", displayName = "Alice A."),
        )

        assertThat(notificationToastSenderName(notification)).isEqualTo("Alice A.")
    }

    @Test
    fun senderName_fallsBackToUsername_whenDisplayNameIsBlank() {
        val notification = ApiNotification(
            id = "n1",
            actor = NotificationActor(id = "u1", username = "alice", displayName = "  "),
        )

        assertThat(notificationToastSenderName(notification)).isEqualTo("alice")
    }

    @Test
    fun senderName_fallsBackToBrand_whenNoActor() {
        assertThat(notificationToastSenderName(ApiNotification(id = "n1"))).isEqualTo("Meeshy")
    }

    @Test
    fun subtitle_prefersConversationTitle() {
        val notification = ApiNotification(
            id = "n1",
            content = "hello",
            context = NotificationContext(conversationTitle = "Team"),
        )

        assertThat(notificationToastSubtitle(notification)).isEqualTo("Team")
    }

    @Test
    fun subtitle_fallsBackToContent_whenNoConversationTitle() {
        val notification = ApiNotification(id = "n1", content = "liked your post")

        assertThat(notificationToastSubtitle(notification)).isEqualTo("liked your post")
    }

    @Test
    fun subtitle_isEmpty_whenNothingToShow() {
        assertThat(notificationToastSubtitle(ApiNotification(id = "n1"))).isEmpty()
    }
}
