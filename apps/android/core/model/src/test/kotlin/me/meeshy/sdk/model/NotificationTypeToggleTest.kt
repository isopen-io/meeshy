package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import org.junit.Test

/**
 * Behavioural contract for [NotificationTypeToggle] — the wire-`type` → per-type toggle
 * resolver, a faithful port of iOS `UserNotificationPreferences.isTypeEnabled`
 * (`UserNotificationPreferences+Filter.swift`). The expected verdicts here are derived from
 * iOS semantics (which toggle each `MeeshyNotificationType` case reads), never from this
 * module's own mapping.
 */
class NotificationTypeToggleTest {

    // The default block leaves memberLeftEnabled/commentLikeEnabled OFF, so force every
    // per-type boolean ON to isolate exactly which types survive a single toggle flip.
    private val allOn = UserNotificationPreferences(
        memberLeftEnabled = true,
        commentLikeEnabled = true,
    )

    /** Every per-type boolean forced off — isolates which types are unconditionally allowed. */
    private val allOff = UserNotificationPreferences(
        newMessageEnabled = false,
        missedCallEnabled = false,
        voicemailEnabled = false,
        systemEnabled = false,
        conversationEnabled = false,
        replyEnabled = false,
        mentionEnabled = false,
        reactionEnabled = false,
        contactRequestEnabled = false,
        groupInviteEnabled = false,
        memberJoinedEnabled = false,
        memberLeftEnabled = false,
        postLikeEnabled = false,
        postCommentEnabled = false,
        postRepostEnabled = false,
        storyReactionEnabled = false,
        commentReplyEnabled = false,
        commentLikeEnabled = false,
    )

    /**
     * Known wire types iOS gates on no per-type toggle (`isTypeEnabled` returns `true`) —
     * power-user features (translation/transcription/voice-clone), gamification, and the two
     * categories Android has no toggle field for yet (incoming-call, friend-content). These
     * must surface even with every toggle turned off.
     */
    private val alwaysOn = setOf(
        "translation_completed", "translation_ready", "TRANSLATION_READY",
        "transcription_completed", "voice_clone_ready",
        "achievement_unlocked", "ACHIEVEMENT_UNLOCKED", "streak_milestone", "badge_earned",
        "AFFILIATE_SIGNUP", "STATUS_UPDATE",
        "incoming_call", "call", "CALL_INCOMING",
        "friend_new_story", "friend_new_post", "friend_new_mood",
    )

    /** Wire types iOS routes to `systemEnabled`. */
    private val systemGated = setOf(
        "security_alert", "login_new_device", "SYSTEM_ALERT",
        "password_changed", "two_factor_enabled", "two_factor_disabled",
        "system", "maintenance", "update_available",
    )

    @Test
    fun everyTypeIsAllowedWhenAllTogglesAreOn() {
        NotificationTypeVocabulary.KNOWN_TYPES.forEach { type ->
            assertThat(NotificationTypeToggle.isEnabled(type, allOn)).isTrue()
        }
    }

    @Test
    fun onlyTheToggleLessTypesSurviveEveryToggleOff() {
        NotificationTypeVocabulary.KNOWN_TYPES.forEach { type ->
            val expected = type in alwaysOn
            assertThat(NotificationTypeToggle.isEnabled(type, allOff))
                .isEqualTo(expected)
        }
    }

    @Test
    fun systemTypesFollowSystemEnabled() {
        val onlySystemOff = allOn.copy(systemEnabled = false)
        systemGated.forEach { type ->
            assertThat(NotificationTypeToggle.isEnabled(type, onlySystemOff)).isFalse()
        }
        // A non-system known type is NOT collateral of the system toggle.
        assertThat(NotificationTypeToggle.isEnabled("new_message", onlySystemOff)).isTrue()
    }

    @Test
    fun newMessageToggleGovernsItsLifecycleTypes() {
        val off = allOn.copy(newMessageEnabled = false)
        listOf(
            "new_message", "NEW_MESSAGE",
            "message_edited", "message_deleted", "message_pinned", "message_forwarded",
        ).forEach { type ->
            assertThat(NotificationTypeToggle.isEnabled(type, off)).isFalse()
        }
        // reply has its own toggle, unaffected by newMessageEnabled.
        assertThat(NotificationTypeToggle.isEnabled("message_reply", off)).isTrue()
    }

    @Test
    fun replyToggleGovernsReplyTypes() {
        val off = allOn.copy(replyEnabled = false)
        assertThat(NotificationTypeToggle.isEnabled("message_reply", off)).isFalse()
        assertThat(NotificationTypeToggle.isEnabled("reply", off)).isFalse()
        assertThat(NotificationTypeToggle.isEnabled("new_message", off)).isTrue()
    }

    @Test
    fun missedCallToggleGovernsFinishedCallTypesButNotIncoming() {
        val off = allOn.copy(missedCallEnabled = false)
        listOf("missed_call", "call_declined", "CALL_MISSED", "call_ended").forEach { type ->
            assertThat(NotificationTypeToggle.isEnabled(type, off)).isFalse()
        }
        // Incoming-call types have no Android toggle → still allowed.
        assertThat(NotificationTypeToggle.isEnabled("incoming_call", off)).isTrue()
    }

    @Test
    fun reactionAndStoryReactionAreDistinctToggles() {
        assertThat(NotificationTypeToggle.isEnabled("message_reaction", allOn.copy(reactionEnabled = false)))
            .isFalse()
        // iOS routes the legacy STORY_REPLY + status_reaction onto storyReactionEnabled, not reaction.
        val storyOff = allOn.copy(storyReactionEnabled = false)
        assertThat(NotificationTypeToggle.isEnabled("story_reaction", storyOff)).isFalse()
        assertThat(NotificationTypeToggle.isEnabled("status_reaction", storyOff)).isFalse()
        assertThat(NotificationTypeToggle.isEnabled("STORY_REPLY", storyOff)).isFalse()
        // reaction toggle does not touch story types.
        assertThat(NotificationTypeToggle.isEnabled("story_reaction", allOn.copy(reactionEnabled = false)))
            .isTrue()
    }

    @Test
    fun commentLikeToggleGovernsCommentReactions() {
        val off = allOn.copy(commentLikeEnabled = false)
        assertThat(NotificationTypeToggle.isEnabled("comment_like", off)).isFalse()
        assertThat(NotificationTypeToggle.isEnabled("comment_reaction", off)).isFalse()
        // comment_reply is a different toggle.
        assertThat(NotificationTypeToggle.isEnabled("comment_reply", off)).isTrue()
        assertThat(NotificationTypeToggle.isEnabled("comment_reply", allOn.copy(commentReplyEnabled = false)))
            .isFalse()
    }

    @Test
    fun contactRequestToggleGovernsRequestsAndAcceptances() {
        val off = allOn.copy(contactRequestEnabled = false)
        listOf(
            "friend_request", "contact_request", "FRIEND_REQUEST",
            "friend_accepted", "contact_accepted", "FRIEND_ACCEPTED",
        ).forEach { type ->
            assertThat(NotificationTypeToggle.isEnabled(type, off)).isFalse()
        }
        // STATUS_UPDATE lives under the same UI chip but iOS gates it on no toggle.
        assertThat(NotificationTypeToggle.isEnabled("STATUS_UPDATE", off)).isTrue()
    }

    @Test
    fun memberLeftToggleGovernsLeaveAndRoleChangesAndCommunityLifecycle() {
        val off = allOn.copy(memberLeftEnabled = false)
        listOf(
            "member_left", "member_removed", "member_promoted", "member_demoted", "member_role_changed",
            "community_joined", "community_left", "GROUP_JOINED", "GROUP_LEFT",
        ).forEach { type ->
            assertThat(NotificationTypeToggle.isEnabled(type, off)).isFalse()
        }
        // member_joined has its own toggle.
        assertThat(NotificationTypeToggle.isEnabled("member_joined", off)).isTrue()
        assertThat(NotificationTypeToggle.isEnabled("member_joined", allOn.copy(memberJoinedEnabled = false)))
            .isFalse()
    }

    @Test
    fun groupInviteToggleGovernsInvites() {
        val off = allOn.copy(groupInviteEnabled = false)
        assertThat(NotificationTypeToggle.isEnabled("community_invite", off)).isFalse()
        assertThat(NotificationTypeToggle.isEnabled("GROUP_INVITE", off)).isFalse()
    }

    @Test
    fun conversationToggleGovernsConversationLifecycle() {
        val off = allOn.copy(conversationEnabled = false)
        listOf(
            "new_conversation", "new_conversation_direct", "new_conversation_group",
            "added_to_conversation", "removed_from_conversation",
        ).forEach { type ->
            assertThat(NotificationTypeToggle.isEnabled(type, off)).isFalse()
        }
    }

    @Test
    fun postCommentToggleGovernsPostAndStoryComments() {
        val off = allOn.copy(postCommentEnabled = false)
        listOf(
            "post_comment", "POST_COMMENT",
            "story_new_comment", "friend_story_comment", "story_thread_reply",
        ).forEach { type ->
            assertThat(NotificationTypeToggle.isEnabled(type, off)).isFalse()
        }
        assertThat(NotificationTypeToggle.isEnabled("post_repost", off)).isTrue()
        assertThat(NotificationTypeToggle.isEnabled("post_repost", allOn.copy(postRepostEnabled = false)))
            .isFalse()
    }

    @Test
    fun postLikeAndMentionHaveTheirOwnToggles() {
        assertThat(NotificationTypeToggle.isEnabled("post_like", allOn.copy(postLikeEnabled = false))).isFalse()
        assertThat(NotificationTypeToggle.isEnabled("POST_LIKE", allOn.copy(postLikeEnabled = false))).isFalse()
        val mentionOff = allOn.copy(mentionEnabled = false)
        listOf("user_mentioned", "mention", "MENTION").forEach { type ->
            assertThat(NotificationTypeToggle.isEnabled(type, mentionOff)).isFalse()
        }
    }

    @Test
    fun anUnknownWireTypeCollapsesOntoTheSystemToggle() {
        assertThat(NotificationTypeToggle.isEnabled("something_the_client_never_heard_of", allOn)).isTrue()
        assertThat(
            NotificationTypeToggle.isEnabled(
                "something_the_client_never_heard_of",
                allOn.copy(systemEnabled = false),
            ),
        ).isFalse()
    }

    @Test
    fun aBlankWireTypeCollapsesOntoTheSystemToggle() {
        assertThat(NotificationTypeToggle.isEnabled("", allOn.copy(systemEnabled = false))).isFalse()
        assertThat(NotificationTypeToggle.isEnabled("", allOn)).isTrue()
    }
}
