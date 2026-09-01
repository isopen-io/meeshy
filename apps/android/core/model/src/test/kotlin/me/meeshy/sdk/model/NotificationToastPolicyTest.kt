package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import org.junit.Test

/**
 * Pure decision core for the in-app real-time notification toast (feature-parity §M) — a faithful
 * port of iOS's in-app banner rule (`NotificationToastManager.handleNewNotification` +
 * `UserNotificationPreferences.allowsInAppBanner`): active-screen suppression, then dedup, then
 * the PER-TYPE toggle. The push-master and DND window are deliberately NOT applied to the in-app
 * banner (they gate the foreground push banner via `PushPresentationPolicy`), so a user with the
 * app open never goes blind inside it.
 */
class NotificationToastPolicyTest {

    private fun notification(
        id: String = "n1",
        type: String = "system",
        conversationId: String? = "c1",
        postId: String? = null,
    ) = ApiNotification(
        id = id,
        type = type,
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
        )

        assertThat(decision).isEqualTo(NotificationToastDecision.Deduplicated)
    }

    @Test
    fun decide_showsWhenPushIsDisabled_theInAppBannerIgnoresThePushMaster() {
        // iOS `allowsInAppBanner` deliberately does NOT consult `pushEnabled`: cutting push off
        // asks not to be interrupted OUTSIDE the app, not to go blind INSIDE it. The push master
        // gates the foreground push banner (`PushPresentationPolicy`), never the in-app banner.
        val target = notification(type = "new_message")
        val decision = NotificationToastPolicy.decide(
            notification = target,
            activeConversationId = null,
            activePostId = null,
            isDuplicateDelivery = false,
            preferences = UserNotificationPreferences(pushEnabled = false),
        )

        assertThat(decision).isEqualTo(NotificationToastDecision.Show(target))
    }

    @Test
    fun decide_showsInsideTheDndWindow_theInAppBannerIgnoresQuietHours() {
        // Same reasoning as the push master: DND protects an ABSENT user; here the user is present
        // and looking at the app. DND gates the foreground push banner, not the in-app banner.
        val target = notification(type = "new_message")
        val decision = NotificationToastPolicy.decide(
            notification = target,
            activeConversationId = null,
            activePostId = null,
            isDuplicateDelivery = false,
            preferences = UserNotificationPreferences(
                dndEnabled = true,
                dndStartTime = "00:00",
                dndEndTime = "23:59",
            ),
        )

        assertThat(decision).isEqualTo(NotificationToastDecision.Show(target))
    }

    @Test
    fun decide_blocksWhenThisTypesPerTypeToggleIsOff() {
        // memberLeftEnabled defaults to false → a member_left toast is suppressed.
        val decision = NotificationToastPolicy.decide(
            notification = notification(type = "member_left"),
            activeConversationId = null,
            activePostId = null,
            isDuplicateDelivery = false,
            preferences = UserNotificationPreferences(),
        )

        assertThat(decision).isEqualTo(NotificationToastDecision.BlockedByPreferences)
    }

    @Test
    fun decide_showsWhenThisTypesPerTypeToggleIsOn() {
        val target = notification(type = "new_message")
        val decision = NotificationToastPolicy.decide(
            notification = target,
            activeConversationId = null,
            activePostId = null,
            isDuplicateDelivery = false,
            preferences = UserNotificationPreferences(),
        )

        assertThat(decision).isEqualTo(NotificationToastDecision.Show(target))
    }

    @Test
    fun decide_showsAToggleLessTypeEvenWhenNearbyTogglesAreOff() {
        // translation notifications have no per-type toggle → they survive even with
        // reaction/system toggles off (the in-app gate is the per-type toggle alone).
        val target = notification(type = "translation_completed")
        val decision = NotificationToastPolicy.decide(
            notification = target,
            activeConversationId = null,
            activePostId = null,
            isDuplicateDelivery = false,
            preferences = UserNotificationPreferences(systemEnabled = false, reactionEnabled = false),
        )

        assertThat(decision).isEqualTo(NotificationToastDecision.Show(target))
    }

    @Test
    fun decide_perTypeToggleStillGovernsWhenPushIsDisabled() {
        // The push master is irrelevant to the in-app banner, but the per-type toggle still gates:
        // a disabled type is blocked whether push is on or off.
        val decision = NotificationToastPolicy.decide(
            notification = notification(type = "member_left"),
            activeConversationId = null,
            activePostId = null,
            isDuplicateDelivery = false,
            preferences = UserNotificationPreferences(pushEnabled = false),
        )

        assertThat(decision).isEqualTo(NotificationToastDecision.BlockedByPreferences)
    }

    @Test
    fun decide_deduplicationWinsOverADisabledPerTypeToggle() {
        // Dedup is checked before the per-type gate (iOS order): a duplicate of a muted type is
        // Deduplicated, not BlockedByPreferences.
        val decision = NotificationToastPolicy.decide(
            notification = notification(type = "member_left"),
            activeConversationId = null,
            activePostId = null,
            isDuplicateDelivery = true,
            preferences = UserNotificationPreferences(),
        )

        assertThat(decision).isEqualTo(NotificationToastDecision.Deduplicated)
    }

    @Test
    fun decide_activeScreenSuppressionWinsOverDeduplicationAndPrefs() {
        val decision = NotificationToastPolicy.decide(
            notification = notification(conversationId = "c1", type = "member_left"),
            activeConversationId = "c1",
            activePostId = null,
            isDuplicateDelivery = true,
            preferences = UserNotificationPreferences(),
        )

        assertThat(decision).isEqualTo(NotificationToastDecision.SuppressedActiveScreen)
    }
}
