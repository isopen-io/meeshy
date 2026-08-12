package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import org.junit.Test

/**
 * [notificationTypeAccentHex] — the SSOT that colour-codes a notification row by
 * its semantic category, a faithful port of iOS `MeeshyNotificationType.accentHex`
 * (NotificationModels.swift). The row previously hardcoded the brand indigo for
 * every notification; this maps each backend `type` string (lowercase current
 * form AND legacy uppercase alias) to its category accent so messages, reactions,
 * mentions, social graph, community, calls, security and translation each read
 * distinctly — the "colour coherence" the reviewer rubric demands.
 */
class NotificationAccentTest {

    @Test
    fun `messages and replies are the blue family`() {
        assertThat(notificationTypeAccentHex("new_message")).isEqualTo("3498DB")
        assertThat(notificationTypeAccentHex("message_reply")).isEqualTo("3498DB")
        assertThat(notificationTypeAccentHex("post_comment")).isEqualTo("3498DB")
        assertThat(notificationTypeAccentHex("story_thread_reply")).isEqualTo("3498DB")
        assertThat(notificationTypeAccentHex("message_edited")).isEqualTo("3498DB")
    }

    @Test
    fun `reactions and likes are the coral family`() {
        assertThat(notificationTypeAccentHex("message_reaction")).isEqualTo("FF6B6B")
        assertThat(notificationTypeAccentHex("post_like")).isEqualTo("FF6B6B")
        assertThat(notificationTypeAccentHex("comment_reaction")).isEqualTo("FF6B6B")
        assertThat(notificationTypeAccentHex("story_reaction")).isEqualTo("FF6B6B")
    }

    @Test
    fun `mentions and reposts are the purple family`() {
        assertThat(notificationTypeAccentHex("user_mentioned")).isEqualTo("9B59B6")
        assertThat(notificationTypeAccentHex("mention")).isEqualTo("9B59B6")
        assertThat(notificationTypeAccentHex("post_repost")).isEqualTo("9B59B6")
    }

    @Test
    fun `friend graph and conversation lifecycle are the teal family`() {
        assertThat(notificationTypeAccentHex("friend_request")).isEqualTo("4ECDC4")
        assertThat(notificationTypeAccentHex("contact_accepted")).isEqualTo("4ECDC4")
        assertThat(notificationTypeAccentHex("new_conversation_group")).isEqualTo("4ECDC4")
        assertThat(notificationTypeAccentHex("removed_from_conversation")).isEqualTo("4ECDC4")
    }

    @Test
    fun `community, membership and achievements are the gold family`() {
        assertThat(notificationTypeAccentHex("community_invite")).isEqualTo("F8B500")
        assertThat(notificationTypeAccentHex("member_promoted")).isEqualTo("F8B500")
        assertThat(notificationTypeAccentHex("achievement_unlocked")).isEqualTo("F8B500")
        assertThat(notificationTypeAccentHex("badge_earned")).isEqualTo("F8B500")
    }

    @Test
    fun `calls are the pink family`() {
        assertThat(notificationTypeAccentHex("missed_call")).isEqualTo("E91E63")
        assertThat(notificationTypeAccentHex("incoming_call")).isEqualTo("E91E63")
        assertThat(notificationTypeAccentHex("call_ended")).isEqualTo("E91E63")
    }

    @Test
    fun `affiliate signup keeps its distinct green`() {
        assertThat(notificationTypeAccentHex("AFFILIATE_SIGNUP")).isEqualTo("2ECC71")
    }

    @Test
    fun `security notifications are the alert red`() {
        assertThat(notificationTypeAccentHex("security_alert")).isEqualTo("EF4444")
        assertThat(notificationTypeAccentHex("login_new_device")).isEqualTo("EF4444")
        assertThat(notificationTypeAccentHex("two_factor_enabled")).isEqualTo("EF4444")
    }

    @Test
    fun `translation and voice pipeline are the cyan family`() {
        assertThat(notificationTypeAccentHex("translation_completed")).isEqualTo("08D9D6")
        assertThat(notificationTypeAccentHex("transcription_completed")).isEqualTo("08D9D6")
        assertThat(notificationTypeAccentHex("voice_clone_ready")).isEqualTo("08D9D6")
    }

    @Test
    fun `system and friend-new content carry the brand indigo`() {
        assertThat(notificationTypeAccentHex("system")).isEqualTo("6366F1")
        assertThat(notificationTypeAccentHex("maintenance")).isEqualTo("6366F1")
        assertThat(notificationTypeAccentHex("friend_new_story")).isEqualTo("6366F1")
        assertThat(notificationTypeAccentHex("friend_new_post")).isEqualTo("6366F1")
    }

    @Test
    fun `an unknown type falls back to the brand indigo`() {
        assertThat(notificationTypeAccentHex("something_the_client_does_not_know")).isEqualTo("6366F1")
    }

    @Test
    fun `an empty type falls back to the brand indigo`() {
        assertThat(notificationTypeAccentHex("")).isEqualTo("6366F1")
    }

    @Test
    fun `legacy uppercase aliases resolve to the same family as their lowercase form`() {
        // The backend still emits the historical uppercase strings for some events;
        // both wire forms must land on one colour so a row never flips accent by age.
        assertThat(notificationTypeAccentHex("NEW_MESSAGE"))
            .isEqualTo(notificationTypeAccentHex("new_message"))
        assertThat(notificationTypeAccentHex("POST_LIKE"))
            .isEqualTo(notificationTypeAccentHex("post_like"))
        assertThat(notificationTypeAccentHex("MENTION"))
            .isEqualTo(notificationTypeAccentHex("mention"))
        assertThat(notificationTypeAccentHex("FRIEND_REQUEST"))
            .isEqualTo(notificationTypeAccentHex("friend_request"))
        assertThat(notificationTypeAccentHex("GROUP_INVITE"))
            .isEqualTo(notificationTypeAccentHex("community_invite"))
        assertThat(notificationTypeAccentHex("CALL_MISSED"))
            .isEqualTo(notificationTypeAccentHex("missed_call"))
        assertThat(notificationTypeAccentHex("SYSTEM_ALERT"))
            .isEqualTo(notificationTypeAccentHex("security_alert"))
        assertThat(notificationTypeAccentHex("TRANSLATION_READY"))
            .isEqualTo(notificationTypeAccentHex("translation_completed"))
    }

    @Test
    fun `distinct categories never collapse onto one colour`() {
        val samples = listOf(
            "new_message", "post_like", "user_mentioned", "friend_request",
            "community_invite", "missed_call", "AFFILIATE_SIGNUP",
            "security_alert", "translation_completed", "system",
        )
        val colours = samples.map { notificationTypeAccentHex(it) }
        assertThat(colours.toSet()).hasSize(samples.size)
    }
}
