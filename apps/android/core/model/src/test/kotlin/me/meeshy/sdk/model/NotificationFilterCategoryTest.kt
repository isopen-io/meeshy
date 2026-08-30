package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import org.junit.Test

/**
 * Pure notification-center category filter — the single source of truth behind the
 * 11 filter chips of the notification list screen (feature-parity §M "Notification
 * center with category filters"). A faithful port of iOS `NotificationCategory`
 * (`MeeshyUI/Notifications/NotificationListView.swift`): each chip owns a set of
 * backend `type` strings and a `matches(type)` predicate, and [filter] reproduces
 * iOS `NotificationListViewModel.filteredNotifications` exactly — `ALL` keeps
 * everything, `UNREAD` keeps only unread rows, every other chip keeps only rows whose
 * type belongs to that category.
 */
class NotificationFilterCategoryTest {

    private fun notif(type: String, read: Boolean = false, id: String = type) =
        ApiNotification(id = id, type = type, state = NotificationState(isRead = read))

    // ---- vocabulary + canonicalization ----------------------------------

    @Test
    fun knownTypes_holdsEveryPortediOSRawValue() {
        // 81 MeeshyNotificationType raw values (67 canonical + 14 legacy aliases).
        assertThat(NotificationTypeVocabulary.KNOWN_TYPES).hasSize(81)
        assertThat(NotificationTypeVocabulary.KNOWN_TYPES).containsAtLeast(
            "new_message", "NEW_MESSAGE", "call", "member_role_changed",
            "AFFILIATE_SIGNUP", "voice_clone_ready", "friend_new_mood",
        )
    }

    @Test
    fun canonical_keepsKnownTypeUnchanged() {
        assertThat(NotificationTypeVocabulary.canonical("post_like")).isEqualTo("post_like")
        assertThat(NotificationTypeVocabulary.canonical("POST_LIKE")).isEqualTo("POST_LIKE")
    }

    @Test
    fun canonical_collapsesUnknownTypeOntoSystem() {
        // iOS: MeeshyNotificationType(rawValue: type) ?? .system
        assertThat(NotificationTypeVocabulary.canonical("brand_new_wire_type")).isEqualTo("system")
        assertThat(NotificationTypeVocabulary.canonical("")).isEqualTo("system")
    }

    // ---- matches() per chip ---------------------------------------------

    @Test
    fun matches_messagesChip_coversMessageLifecycleAndBothCaseForms() {
        val c = NotificationFilterCategory.MESSAGES
        assertThat(c.matches("new_message")).isTrue()
        assertThat(c.matches("NEW_MESSAGE")).isTrue()
        assertThat(c.matches("reply")).isTrue()
        assertThat(c.matches("message_forwarded")).isTrue()
        assertThat(c.matches("post_like")).isFalse()
    }

    @Test
    fun matches_reactionsChip_coversMessageAndSocialReactions() {
        val c = NotificationFilterCategory.REACTIONS
        assertThat(c.matches("message_reaction")).isTrue()
        assertThat(c.matches("MESSAGE_REACTION")).isTrue()
        assertThat(c.matches("post_like")).isTrue()
        assertThat(c.matches("comment_like")).isTrue()
        assertThat(c.matches("mention")).isFalse()
    }

    @Test
    fun matches_callsChip_includesTheChinaRegionPlainCallAlias() {
        val c = NotificationFilterCategory.CALLS
        assertThat(c.matches("missed_call")).isTrue()
        assertThat(c.matches("call")).isTrue() // iOS incomingCallAlert = "call"
        assertThat(c.matches("CALL_MISSED")).isTrue()
        assertThat(c.matches("new_message")).isFalse()
    }

    @Test
    fun matches_groupsChip_spansCommunityMembershipAndConversationLifecycle() {
        val c = NotificationFilterCategory.GROUPS
        assertThat(c.matches("community_invite")).isTrue()
        assertThat(c.matches("member_promoted")).isTrue()
        assertThat(c.matches("added_to_conversation")).isTrue()
        assertThat(c.matches("GROUP_LEFT")).isTrue()
        assertThat(c.matches("friend_request")).isFalse()
    }

    @Test
    fun matches_systemChip_absorbsUnknownTypesButNotKnownUncategorizedOnes() {
        val c = NotificationFilterCategory.SYSTEM
        assertThat(c.matches("security_alert")).isTrue()
        assertThat(c.matches("achievement_unlocked")).isTrue()
        // Unknown → canonical "system" → matches SYSTEM (iOS enum-decode fallback).
        assertThat(c.matches("some_future_type")).isTrue()
        // Known but uncategorized → decodes to its own case → matches NO default chip.
        assertThat(c.matches("comment_reaction")).isFalse()
        assertThat(c.matches("friend_new_post")).isFalse()
    }

    @Test
    fun matches_allAndUnread_matchEveryType() {
        listOf(NotificationFilterCategory.ALL, NotificationFilterCategory.UNREAD).forEach { c ->
            assertThat(c.matches("post_like")).isTrue()
            assertThat(c.matches("comment_reaction")).isTrue() // uncategorized still "matches" ALL
            assertThat(c.matches("totally_unknown")).isTrue()
        }
    }

    @Test
    fun knownUncategorizedTypes_matchNoDefaultChip() {
        val uncategorized = listOf(
            "new_conversation_direct", "new_conversation_group", "comment_reaction",
            "story_new_comment", "friend_story_comment", "story_thread_reply",
            "friend_new_story", "friend_new_post", "friend_new_mood",
        )
        val defaultChips = NotificationFilterCategory.entries.filter {
            it != NotificationFilterCategory.ALL && it != NotificationFilterCategory.UNREAD
        }
        uncategorized.forEach { type ->
            defaultChips.forEach { chip ->
                assertThat(chip.matches(type)).isFalse()
            }
        }
    }

    // ---- filter() list projection ---------------------------------------

    @Test
    fun filter_all_returnsEveryRowUnchanged() {
        val rows = listOf(notif("new_message", read = true), notif("post_like"))
        assertThat(NotificationFilterCategory.ALL.filter(rows)).isEqualTo(rows)
    }

    @Test
    fun filter_unread_keepsOnlyUnreadRegardlessOfType() {
        val rows = listOf(
            notif("new_message", read = false),
            notif("post_like", read = true),
            notif("some_unknown", read = false),
        )
        val result = NotificationFilterCategory.UNREAD.filter(rows)
        assertThat(result.map { it.type }).containsExactly("new_message", "some_unknown").inOrder()
    }

    @Test
    fun filter_defaultChip_keepsMatchingTypesIncludingAlreadyReadOnes() {
        val rows = listOf(
            notif("new_message", read = true),
            notif("message_reply", read = false),
            notif("post_like", read = false),
        )
        val result = NotificationFilterCategory.MESSAGES.filter(rows)
        // A read message still shows under MESSAGES (chip filters by type, not by read).
        assertThat(result.map { it.type }).containsExactly("new_message", "message_reply").inOrder()
    }

    @Test
    fun filter_defaultChip_preservesInputOrder() {
        val rows = listOf(notif("post_like", id = "a"), notif("comment_like", id = "b"), notif("post_like", id = "c"))
        val result = NotificationFilterCategory.REACTIONS.filter(rows)
        assertThat(result.map { it.id }).containsExactly("a", "b", "c").inOrder()
    }

    @Test
    fun filter_emptyList_isEmptyForEveryChip() {
        NotificationFilterCategory.entries.forEach { chip ->
            assertThat(chip.filter(emptyList())).isEmpty()
        }
    }

    // ---- chip enumeration + accent parity -------------------------------

    @Test
    fun chips_areTheElevenIosCategoriesInDisplayOrder() {
        assertThat(NotificationFilterCategory.entries.map { it.name }).containsExactly(
            "ALL", "UNREAD", "MESSAGES", "REACTIONS", "MENTIONS", "SOCIAL",
            "CONTACTS", "GROUPS", "CALLS", "TRANSLATIONS", "SYSTEM",
        ).inOrder()
    }

    @Test
    fun accentHex_matchesIosPerCategoryColour() {
        assertThat(NotificationFilterCategory.MESSAGES.accentHex).isEqualTo("3498DB")
        assertThat(NotificationFilterCategory.MENTIONS.accentHex).isEqualTo("9B59B6")
        assertThat(NotificationFilterCategory.CALLS.accentHex).isEqualTo("E91E63")
        assertThat(NotificationFilterCategory.TRANSLATIONS.accentHex).isEqualTo("08D9D6")
        assertThat(NotificationFilterCategory.SYSTEM.accentHex).isEqualTo("6366F1")
    }

    @Test
    fun everyDefaultChipMatchingType_isAKnownType() {
        NotificationFilterCategory.entries.forEach { chip ->
            chip.matchingTypes.forEach { type ->
                assertThat(NotificationTypeVocabulary.KNOWN_TYPES).contains(type)
            }
        }
    }
}
