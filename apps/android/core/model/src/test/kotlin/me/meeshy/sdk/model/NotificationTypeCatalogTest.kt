package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import org.junit.Test

/**
 * Pure per-event notification-type catalog — the single source of truth for the
 * grouped, searchable notification-type editor (feature-parity §L). It projects the
 * per-event booleans of [UserNotificationPreferences] into ordered, category-grouped
 * sections, filters them by an injected (locale-aware) label matcher, and provides the
 * toggle lens so a single edit never clobbers the other booleans.
 */
class NotificationTypeCatalogTest {

    private val shownTypes = NotificationType.entries - NotificationTypeCatalog.hiddenTypes

    // ---- toggle / isEnabled lenses ---------------------------------------

    @Test
    fun toggle_thenIsEnabled_roundTripsForEveryType() {
        NotificationType.entries.forEach { type ->
            val on = NotificationTypeCatalog.toggle(UserNotificationPreferences(), type, enabled = true)
            assertThat(NotificationTypeCatalog.isEnabled(on, type)).isTrue()

            val off = NotificationTypeCatalog.toggle(on, type, enabled = false)
            assertThat(NotificationTypeCatalog.isEnabled(off, type)).isFalse()
        }
    }

    @Test
    fun toggle_doesNotClobberOtherTypesOrTopLevelToggles() {
        val result = NotificationTypeCatalog.toggle(
            UserNotificationPreferences(),
            NotificationType.MENTION,
            enabled = false,
        )

        assertThat(NotificationTypeCatalog.isEnabled(result, NotificationType.MENTION)).isFalse()
        assertThat(NotificationTypeCatalog.isEnabled(result, NotificationType.REACTION)).isTrue()
        assertThat(result.pushEnabled).isTrue()
        assertThat(result.newMessageEnabled).isTrue()
    }

    // ---- sections: grouping & ordering -----------------------------------

    @Test
    fun sections_groupsEveryTypeIntoItsCategoryInDisplayOrder() {
        val sections = NotificationTypeCatalog.sections(UserNotificationPreferences())

        assertThat(sections.map { it.category }).containsExactly(
            NotificationCategory.MESSAGES,
            NotificationCategory.CALLS,
            NotificationCategory.SOCIAL,
            NotificationCategory.GROUPS,
            NotificationCategory.SYSTEM,
        ).inOrder()
        assertThat(sections.flatMap { it.items }).hasSize(shownTypes.size)
    }

    @Test
    fun sections_preserveTheDeclaredItemOrderWithinACategory() {
        val messages = NotificationTypeCatalog.sections(UserNotificationPreferences())
            .first { it.category == NotificationCategory.MESSAGES }
            .items.map { it.type }

        assertThat(messages).containsExactly(
            NotificationType.REPLY,
            NotificationType.MENTION,
            NotificationType.REACTION,
            NotificationType.CONVERSATION,
        ).inOrder()
    }

    @Test
    fun sections_callsCategoryPutsIncomingBeforeMissedAndHidesVoicemail() {
        val calls = NotificationTypeCatalog.sections(UserNotificationPreferences())
            .first { it.category == NotificationCategory.CALLS }
            .items.map { it.type }

        // iOS orders callsEnabled ahead of missedCallEnabled, et a retiré « Messages vocaux ».
        assertThat(calls).containsExactly(
            NotificationType.INCOMING_CALL,
            NotificationType.MISSED_CALL,
        ).inOrder()
        assertThat(NotificationTypeCatalog.hiddenTypes).containsExactly(NotificationType.VOICEMAIL)
    }

    @Test
    fun sections_socialCategoryEndsWithFriendContentThenGame() {
        val social = NotificationTypeCatalog.sections(UserNotificationPreferences())
            .first { it.category == NotificationCategory.SOCIAL }
            .items.map { it.type }

        // iOS : friendContentEnabled puis gameEnabled ferment la section « Fil social ».
        assertThat(social.takeLast(2)).containsExactly(NotificationType.FRIEND_CONTENT, NotificationType.GAME).inOrder()
    }

    @Test
    fun sections_contactActivityFollowsContactRequestInGroups() {
        val groups = NotificationTypeCatalog.sections(UserNotificationPreferences())
            .first { it.category == NotificationCategory.GROUPS }
            .items.map { it.type }

        assertThat(groups.take(2)).containsExactly(
            NotificationType.CONTACT_REQUEST,
            NotificationType.CONTACT_ACTIVITY,
        ).inOrder()
    }

    @Test
    fun toggle_gameAndContactActivityLensesReadAndWriteTheirOwnField() {
        val off = NotificationTypeCatalog.toggle(UserNotificationPreferences(), NotificationType.GAME, enabled = false)
        assertThat(off.gameEnabled).isFalse()
        assertThat(off.contactActivityEnabled).isTrue()
        val off2 = NotificationTypeCatalog.toggle(off, NotificationType.CONTACT_ACTIVITY, enabled = false)
        assertThat(off2.contactActivityEnabled).isFalse()
        assertThat(off2.gameEnabled).isFalse()
    }

    @Test
    fun toggle_incomingCallLensReadsAndWritesCallsEnabled() {
        val off = NotificationTypeCatalog.toggle(
            UserNotificationPreferences(callsEnabled = true),
            NotificationType.INCOMING_CALL,
            enabled = false,
        )
        assertThat(off.callsEnabled).isFalse()
        assertThat(NotificationTypeCatalog.isEnabled(off, NotificationType.INCOMING_CALL)).isFalse()
        // The neighbouring missed-call toggle is untouched.
        assertThat(off.missedCallEnabled).isTrue()
    }

    @Test
    fun toggle_friendContentLensReadsAndWritesFriendContentEnabled() {
        val off = NotificationTypeCatalog.toggle(
            UserNotificationPreferences(friendContentEnabled = true),
            NotificationType.FRIEND_CONTENT,
            enabled = false,
        )
        assertThat(off.friendContentEnabled).isFalse()
        assertThat(NotificationTypeCatalog.isEnabled(off, NotificationType.FRIEND_CONTENT)).isFalse()
        assertThat(off.commentLikeEnabled).isEqualTo(UserNotificationPreferences().commentLikeEnabled)
    }

    // ---- sections: enabled-state derivation ------------------------------

    @Test
    fun sections_carryTheEnabledStateFromPrefs() {
        val prefs = UserNotificationPreferences(mentionEnabled = false, memberLeftEnabled = true)
        val items = NotificationTypeCatalog.sections(prefs).flatMap { it.items }

        assertThat(items.first { it.type == NotificationType.MENTION }.enabled).isFalse()
        assertThat(items.first { it.type == NotificationType.MEMBER_LEFT }.enabled).isTrue()
        assertThat(items.first { it.type == NotificationType.REACTION }.enabled).isTrue()
    }

    // ---- sections: search filtering --------------------------------------

    @Test
    fun sections_blankQueryKeepsEveryType() {
        val sections = NotificationTypeCatalog.sections(UserNotificationPreferences(), query = "")
        assertThat(sections.flatMap { it.items }).hasSize(shownTypes.size)
    }

    @Test
    fun sections_whitespaceOnlyQueryIsTreatedAsNoFilter() {
        val sections = NotificationTypeCatalog.sections(UserNotificationPreferences(), query = "   ")
        assertThat(sections.flatMap { it.items }).hasSize(shownTypes.size)
    }

    @Test
    fun sections_filterMatchesLabelsCaseInsensitivelyAndOmitsEmptyCategories() {
        // Default label is the enum name; "comment" matches POST_COMMENT, COMMENT_REPLY, COMMENT_LIKE,
        // all in SOCIAL — so only the SOCIAL section survives, in declared order.
        val sections = NotificationTypeCatalog.sections(UserNotificationPreferences(), query = "COMMENT")

        assertThat(sections.map { it.category }).containsExactly(NotificationCategory.SOCIAL)
        assertThat(sections.single().items.map { it.type }).containsExactly(
            NotificationType.POST_COMMENT,
            NotificationType.COMMENT_REPLY,
            NotificationType.COMMENT_LIKE,
        ).inOrder()
    }

    @Test
    fun sections_queryMatchingNothingReturnsNoSections() {
        val sections = NotificationTypeCatalog.sections(UserNotificationPreferences(), query = "zzz-no-match")
        assertThat(sections).isEmpty()
    }

    @Test
    fun sections_filterUsesTheInjectedLocaleAwareLabel() {
        val frenchLabel: (NotificationType) -> String = { type ->
            if (type == NotificationType.MISSED_CALL) "Appels manqués" else "autre"
        }

        val sections = NotificationTypeCatalog.sections(
            UserNotificationPreferences(),
            query = "manqué",
            label = frenchLabel,
        )

        assertThat(sections.single().category).isEqualTo(NotificationCategory.CALLS)
        assertThat(sections.single().items.map { it.type }).containsExactly(NotificationType.MISSED_CALL)
    }
}
