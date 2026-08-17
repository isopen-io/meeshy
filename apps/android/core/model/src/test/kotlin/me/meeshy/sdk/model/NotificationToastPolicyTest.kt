package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import java.time.LocalDateTime
import org.junit.Test

/**
 * Pure decision core for the in-app real-time notification toast (feature-parity §M) — the
 * dedup/active-screen-suppression/push+DND gate extracted from iOS's impure
 * `NotificationToastManager.handleNewNotification` guard-chain.
 */
class NotificationToastPolicyTest {

    private val now = LocalDateTime.of(2026, 8, 17, 12, 0)

    private fun notification(
        id: String = "n1",
        conversationId: String? = "c1",
        postId: String? = null,
    ) = ApiNotification(
        id = id,
        context = NotificationContext(conversationId = conversationId, postId = postId),
    )

    @Test
    fun decide_showsByDefault() {
        val decision = NotificationToastPolicy.decide(
            notification = notification(),
            activeConversationId = null,
            activePostId = null,
            isDuplicateDelivery = false,
            preferences = UserNotificationPreferences(),
            now = now,
        )

        assertThat(decision).isEqualTo(NotificationToastDecision.Show(notification()))
    }

    @Test
    fun decide_suppressesWhenTheConversationIsAlreadyOpen() {
        val decision = NotificationToastPolicy.decide(
            notification = notification(conversationId = "c1"),
            activeConversationId = "c1",
            activePostId = null,
            isDuplicateDelivery = false,
            preferences = UserNotificationPreferences(),
            now = now,
        )

        assertThat(decision).isEqualTo(NotificationToastDecision.SuppressedActiveScreen)
    }

    @Test
    fun decide_suppressesWhenThePostIsAlreadyOpen() {
        val decision = NotificationToastPolicy.decide(
            notification = notification(conversationId = null, postId = "p1"),
            activeConversationId = null,
            activePostId = "p1",
            isDuplicateDelivery = false,
            preferences = UserNotificationPreferences(),
            now = now,
        )

        assertThat(decision).isEqualTo(NotificationToastDecision.SuppressedActiveScreen)
    }

    @Test
    fun decide_aDifferentOpenConversationDoesNotSuppress() {
        val decision = NotificationToastPolicy.decide(
            notification = notification(conversationId = "c1"),
            activeConversationId = "c2",
            activePostId = null,
            isDuplicateDelivery = false,
            preferences = UserNotificationPreferences(),
            now = now,
        )

        assertThat(decision).isEqualTo(NotificationToastDecision.Show(notification(conversationId = "c1")))
    }

    @Test
    fun decide_deduplicatesADuplicateDelivery() {
        val decision = NotificationToastPolicy.decide(
            notification = notification(),
            activeConversationId = null,
            activePostId = null,
            isDuplicateDelivery = true,
            preferences = UserNotificationPreferences(),
            now = now,
        )

        assertThat(decision).isEqualTo(NotificationToastDecision.Deduplicated)
    }

    @Test
    fun decide_blocksWhenPushIsDisabled() {
        val decision = NotificationToastPolicy.decide(
            notification = notification(),
            activeConversationId = null,
            activePostId = null,
            isDuplicateDelivery = false,
            preferences = UserNotificationPreferences(pushEnabled = false),
            now = now,
        )

        assertThat(decision).isEqualTo(NotificationToastDecision.BlockedByPreferences)
    }

    @Test
    fun decide_blocksInsideTheDndWindow() {
        val decision = NotificationToastPolicy.decide(
            notification = notification(),
            activeConversationId = null,
            activePostId = null,
            isDuplicateDelivery = false,
            preferences = UserNotificationPreferences(
                dndEnabled = true,
                dndStartTime = "00:00",
                dndEndTime = "23:59",
            ),
            now = now,
        )

        assertThat(decision).isEqualTo(NotificationToastDecision.BlockedByPreferences)
    }

    @Test
    fun decide_activeScreenSuppressionWinsOverDeduplicationAndPrefs() {
        val decision = NotificationToastPolicy.decide(
            notification = notification(conversationId = "c1"),
            activeConversationId = "c1",
            activePostId = null,
            isDuplicateDelivery = true,
            preferences = UserNotificationPreferences(pushEnabled = false),
            now = now,
        )

        assertThat(decision).isEqualTo(NotificationToastDecision.SuppressedActiveScreen)
    }
}
