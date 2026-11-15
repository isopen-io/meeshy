package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import java.time.LocalDateTime
import org.junit.Test

class NotificationPreferencesFilterTest {

    private val awake = LocalDateTime.of(2026, 8, 17, 12, 0)
    private val quiet = LocalDateTime.of(2026, 8, 17, 23, 0)
    private val silenced = FocusFilterSnapshot.fromInterruptionFilter(FocusFilterSnapshot.INTERRUPTION_FILTER_NONE)

    private fun allows(
        prefs: UserNotificationPreferences = UserNotificationPreferences(),
        type: String? = "new_message",
        isDirect: Boolean = false,
        focus: FocusFilterSnapshot = FocusFilterSnapshot.PERMISSIVE,
        at: LocalDateTime = awake,
    ) = NotificationPreferencesFilter.allowsNotification(prefs, type, isDirect, focus, at)

    @Test
    fun `tout active laisse passer`() {
        assertThat(allows()).isTrue()
    }

    @Test
    fun `le push maitre coupe tout`() {
        assertThat(allows(prefs = UserNotificationPreferences(pushEnabled = false))).isFalse()
        assertThat(allows(prefs = UserNotificationPreferences(pushEnabled = false), type = "report_resolved")).isFalse()
    }

    @Test
    fun `les heures calmes coupent avant le type`() {
        assertThat(allows(prefs = UserNotificationPreferences(dndEnabled = true), at = quiet)).isFalse()
        assertThat(allows(prefs = UserNotificationPreferences(dndEnabled = true), at = awake)).isTrue()
    }

    @Test
    fun `l interrupteur de type coupe son type seulement`() {
        val prefs = UserNotificationPreferences(gameEnabled = false, contactActivityEnabled = false)

        assertThat(allows(prefs = prefs, type = "game_duo_invited")).isFalse()
        assertThat(allows(prefs = prefs, type = "contact_recently_active")).isFalse()
        assertThat(allows(prefs = prefs, type = "new_message")).isTrue()
    }

    @Test
    fun `un signalement resolu ou un contenu retire passe meme toutes bascules coupees`() {
        val prefs = UserNotificationPreferences(systemEnabled = false, newMessageEnabled = false)

        assertThat(allows(prefs = prefs, type = "report_resolved", focus = silenced)).isTrue()
        assertThat(allows(prefs = prefs, type = "content_removed", focus = silenced)).isTrue()
    }

    @Test
    fun `le focus vient en dernier et suit la table iOS`() {
        assertThat(allows(type = "message_reaction", focus = silenced)).isFalse()
        assertThat(allows(type = "contact_request", focus = silenced)).isTrue()
    }

    @Test
    fun `la banniere in-app ne depend que du type`() {
        val prefs = UserNotificationPreferences(pushEnabled = false, dndEnabled = true, reactionEnabled = false)

        assertThat(NotificationPreferencesFilter.allowsInAppBanner(prefs, "new_message")).isTrue()
        assertThat(NotificationPreferencesFilter.allowsInAppBanner(prefs, "message_reaction")).isFalse()
    }
}

class FocusFilterSnapshotTest {

    @Test
    fun `un filtre inactif laisse tout passer`() {
        assertThat(FocusFilterSnapshot.PERMISSIVE.allows("message_reaction", isDirectConversation = false)).isTrue()
    }

    @Test
    fun `le filtre systeme tout ou inconnu est permissif`() {
        assertThat(FocusFilterSnapshot.fromInterruptionFilter(FocusFilterSnapshot.INTERRUPTION_FILTER_ALL))
            .isEqualTo(FocusFilterSnapshot.PERMISSIVE)
        assertThat(FocusFilterSnapshot.fromInterruptionFilter(FocusFilterSnapshot.INTERRUPTION_FILTER_UNKNOWN))
            .isEqualTo(FocusFilterSnapshot.PERMISSIVE)
    }

    @Test
    fun `le mode priorite garde direct mentions et appels`() {
        val priority = FocusFilterSnapshot.fromInterruptionFilter(FocusFilterSnapshot.INTERRUPTION_FILTER_PRIORITY)

        assertThat(priority.allows("new_message", isDirectConversation = true)).isTrue()
        assertThat(priority.allows("new_message", isDirectConversation = false)).isFalse()
        assertThat(priority.allows("user_mentioned", isDirectConversation = false)).isTrue()
        assertThat(priority.allows("missed_call", isDirectConversation = false)).isTrue()
        assertThat(priority.allows("post_comment", isDirectConversation = false)).isFalse()
    }

    @Test
    fun `aucune interruption coupe toutes les categories gouvernees mais pas les contacts`() {
        val none = FocusFilterSnapshot.fromInterruptionFilter(FocusFilterSnapshot.INTERRUPTION_FILTER_ALARMS)

        assertThat(none.allows("new_message", isDirectConversation = true)).isFalse()
        assertThat(none.allows("incoming_call", isDirectConversation = true)).isFalse()
        assertThat(none.allows("contact_request", isDirectConversation = false)).isTrue()
        assertThat(none.allows(null, isDirectConversation = false)).isTrue()
    }
}
