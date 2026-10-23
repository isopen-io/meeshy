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
        // 91 MeeshyNotificationType raw values iOS (dix types ajoutés par le lot des types complets).
        assertThat(NotificationTypeVocabulary.KNOWN_TYPES).hasSize(91)
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
    fun matches_systemChip_absorbsUnknownTypesAndTheDsaTypes() {
        val c = NotificationFilterCategory.SYSTEM
        assertThat(c.matches("security_alert")).isTrue()
        assertThat(c.matches("report_resolved")).isTrue()
        assertThat(c.matches("content_removed")).isTrue()
        // Unknown → canonical "system" → matches SYSTEM (iOS enum-decode fallback).
        assertThat(c.matches("some_future_type")).isTrue()
        // Les succès ont leur propre catégorie depuis iOS : plus dans Système.
        assertThat(c.matches("achievement_unlocked")).isFalse()
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
    fun everyKnownTypeBelongsToExactlyOneDefaultChip() {
        val defaultChips = NotificationFilterCategory.entries.filter {
            it != NotificationFilterCategory.ALL && it != NotificationFilterCategory.UNREAD
        }
        NotificationTypeVocabulary.KNOWN_TYPES.forEach { type ->
            assertThat(defaultChips.filter { it.matches(type) }).hasSize(1)
        }
    }

    // ---- table de référence iOS (golden) ---------------------------------

    private val iosGolden: Map<NotificationFilterCategory, Set<String>> = mapOf(
        NotificationFilterCategory.MESSAGES to setOf(
            "new_message", "NEW_MESSAGE", "message_reply", "reply",
            "message_edited", "message_deleted", "message_pinned", "message_forwarded",
        ),
        NotificationFilterCategory.REACTIONS to setOf(
            "message_reaction", "reaction", "MESSAGE_REACTION", "post_like", "POST_LIKE",
            "story_reaction", "status_reaction", "comment_like", "comment_reaction",
        ),
        NotificationFilterCategory.MENTIONS to setOf("user_mentioned", "mention", "MENTION"),
        NotificationFilterCategory.SOCIAL to setOf(
            "post_comment", "POST_COMMENT", "post_repost", "comment_reply", "STORY_REPLY",
            "story_new_comment", "friend_story_comment", "story_thread_reply",
            "friend_new_story", "friend_new_post", "friend_new_mood",
        ),
        NotificationFilterCategory.ENGAGEMENT to setOf(
            "achievement_unlocked", "ACHIEVEMENT_UNLOCKED", "streak_milestone", "level_up", "badge_earned",
            "game_duo_invited", "game_duo_accepted", "game_league_result", "game_season_step",
            "game_mission_window",
        ),
        NotificationFilterCategory.CONTACTS to setOf(
            "friend_request", "contact_request", "FRIEND_REQUEST", "friend_accepted", "contact_accepted",
            "FRIEND_ACCEPTED", "contact_joined", "contact_recently_active", "STATUS_UPDATE",
        ),
        NotificationFilterCategory.GROUPS to setOf(
            "community_invite", "community_joined", "community_left", "GROUP_INVITE", "GROUP_JOINED",
            "GROUP_LEFT", "member_joined", "member_left", "member_removed", "member_promoted",
            "member_demoted", "member_role_changed", "added_to_conversation", "new_conversation",
            "new_conversation_direct", "new_conversation_group", "removed_from_conversation",
        ),
        NotificationFilterCategory.CALLS to setOf(
            "missed_call", "call_declined", "CALL_MISSED", "incoming_call", "call", "call_ended", "CALL_INCOMING",
        ),
        NotificationFilterCategory.TRANSLATIONS to setOf(
            "translation_completed", "translation_ready", "TRANSLATION_READY",
            "transcription_completed", "voice_clone_ready",
        ),
        NotificationFilterCategory.SYSTEM to setOf(
            "security_alert", "login_new_device", "SYSTEM_ALERT", "password_changed", "two_factor_enabled",
            "two_factor_disabled", "system", "maintenance", "update_available", "report_resolved",
            "content_removed", "AFFILIATE_SIGNUP",
        ),
    )

    @Test
    fun chaqueCategorieRejoueLaTableDeReferenceIos() {
        iosGolden.forEach { (chip, types) -> assertThat(chip.matchingTypes).isEqualTo(types) }
        assertThat(iosGolden.values.flatten().toSet()).isEqualTo(NotificationTypeVocabulary.KNOWN_TYPES)
    }

    // ---- serverQuery / consommation --------------------------------------

    private val consumable = listOf(
        NotificationFilterCategory.MESSAGES, NotificationFilterCategory.REACTIONS,
        NotificationFilterCategory.MENTIONS, NotificationFilterCategory.SOCIAL,
    ).flatMap { iosGolden.getValue(it) }.toSet()

    @Test
    fun serverQuery_toutes_masqueLesTypesConsommablesTries() {
        val q = NotificationFilterCategory.ALL.serverQuery
        assertThat(q.unreadOnly).isFalse()
        assertThat(q.types).isEmpty()
        assertThat(q.hideReadTypes).isEqualTo(consumable.sorted())
    }

    @Test
    fun serverQuery_nonLues_estUnreadOnlySeul() {
        val q = NotificationFilterCategory.UNREAD.serverQuery
        assertThat(q).isEqualTo(NotificationListQuery(unreadOnly = true, types = emptyList(), hideReadTypes = emptyList()))
    }

    @Test
    fun serverQuery_categorie_typesTriesEtIntersectionAvecLesConsommables() {
        val messages = NotificationFilterCategory.MESSAGES.serverQuery
        assertThat(messages.types).isEqualTo(iosGolden.getValue(NotificationFilterCategory.MESSAGES).sorted())
        assertThat(messages.hideReadTypes).isEqualTo(messages.types)

        val calls = NotificationFilterCategory.CALLS.serverQuery
        assertThat(calls.types).isEqualTo(iosGolden.getValue(NotificationFilterCategory.CALLS).sorted())
        assertThat(calls.hideReadTypes).isEmpty()

        val engagement = NotificationFilterCategory.ENGAGEMENT.serverQuery
        assertThat(engagement.hideReadTypes).isEmpty()
        assertThat(engagement.unreadOnly).isFalse()
    }

    @Test
    fun serverQuery_deuxAppelsDonnentLaMemeRequete() {
        NotificationFilterCategory.entries.forEach { assertThat(it.serverQuery).isEqualTo(it.serverQuery) }
    }

    @Test
    fun accepts_rejetteUneLigneLueDUneFamilleConsommable() {
        listOf("new_message", "message_reaction", "mention", "post_comment").forEach { type ->
            NotificationFilterCategory.entries.forEach { chip ->
                assertThat(chip.accepts(notif(type, read = true))).isFalse()
            }
        }
    }

    @Test
    fun accepts_garde_uneLigneLueDUneFamilleNonConsommable() {
        assertThat(NotificationFilterCategory.ALL.accepts(notif("friend_request", read = true))).isTrue()
        assertThat(NotificationFilterCategory.CONTACTS.accepts(notif("friend_request", read = true))).isTrue()
        assertThat(NotificationFilterCategory.CALLS.accepts(notif("missed_call", read = true))).isTrue()
        assertThat(NotificationFilterCategory.UNREAD.accepts(notif("friend_request", read = true))).isFalse()
    }

    @Test
    fun accepts_rejoueNonLuesEtCategorieCommeLeServeur() {
        assertThat(NotificationFilterCategory.UNREAD.accepts(notif("new_message"))).isTrue()
        assertThat(NotificationFilterCategory.MESSAGES.accepts(notif("new_message"))).isTrue()
        assertThat(NotificationFilterCategory.MESSAGES.accepts(notif("post_like"))).isFalse()
        assertThat(NotificationFilterCategory.ALL.accepts(notif("type_inconnu"))).isTrue()
        assertThat(NotificationFilterCategory.SYSTEM.accepts(notif("type_inconnu", read = true))).isTrue()
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
    fun chips_areTheTwelveIosCategoriesInDisplayOrder() {
        assertThat(NotificationFilterCategory.entries.map { it.name }).containsExactly(
            "ALL", "UNREAD", "MESSAGES", "REACTIONS", "MENTIONS", "SOCIAL", "ENGAGEMENT",
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
        assertThat(NotificationFilterCategory.ENGAGEMENT.accentHex).isEqualTo("FBBF24")
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
