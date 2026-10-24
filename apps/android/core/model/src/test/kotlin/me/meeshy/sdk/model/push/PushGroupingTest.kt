package me.meeshy.sdk.model.push

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.UserNotificationPreferences
import org.junit.Test

class PushGroupingTest {

    @Test
    fun `le groupe suit la conversation puis le post`() {
        assertThat(PushGrouping.groupKey(PushPayload(conversationId = "c1", postId = "p1"))).isEqualTo("conversation:c1")
        assertThat(PushGrouping.groupKey(PushPayload(postId = "p1"))).isEqualTo("post:p1")
        assertThat(PushGrouping.groupKey(PushPayload())).isNull()
    }

    @Test
    fun `regrouper desactive ne donne aucun groupe`() {
        val prefs = UserNotificationPreferences(groupNotifications = false)

        assertThat(PushGrouping.groupKey(PushPayload(conversationId = "c1"), prefs)).isNull()
    }

    @Test
    fun `l id du recapitulatif est stable et distinct par groupe`() {
        assertThat(PushGrouping.summaryNotificationId("conversation:c1"))
            .isEqualTo(PushGrouping.summaryNotificationId("conversation:c1"))
        assertThat(PushGrouping.summaryNotificationId("conversation:c1"))
            .isNotEqualTo(PushGrouping.summaryNotificationId("post:c1"))
    }

    @Test
    fun `une categorie par famille de type et le generique pour l inconnu`() {
        assertThat(PushChannelCategory.of("new_message")).isEqualTo(PushChannelCategory.MESSAGES)
        assertThat(PushChannelCategory.of("post_like")).isEqualTo(PushChannelCategory.SOCIAL)
        assertThat(PushChannelCategory.of("security_alert")).isEqualTo(PushChannelCategory.SYSTEM)
        assertThat(PushChannelCategory.of("future_type")).isEqualTo(PushChannelCategory.MESSAGES)
        assertThat(PushChannelCategory.of(null)).isEqualTo(PushChannelCategory.MESSAGES)
    }
}

class PushBadgePolicyTest {

    @Test
    fun `le badge de la passerelle l emporte sur le compte local`() {
        assertThat(PushBadgePolicy.badge(PushPayload(unreadCount = 4), UserNotificationPreferences(), localUnreadConversations = 9))
            .isEqualTo(4)
    }

    @Test
    fun `sans cle le badge est derive localement`() {
        assertThat(PushBadgePolicy.badge(PushPayload(), UserNotificationPreferences(), localUnreadConversations = 9)).isEqualTo(9)
        assertThat(PushBadgePolicy.badge(PushPayload(), UserNotificationPreferences(), localUnreadConversations = null)).isNull()
    }

    @Test
    fun `badges coupes effacent le badge`() {
        val prefs = UserNotificationPreferences(notificationBadgeEnabled = false)

        assertThat(PushBadgePolicy.badge(PushPayload(unreadCount = 4), prefs, localUnreadConversations = 9)).isEqualTo(0)
    }

    @Test
    fun `un compte negatif est ramene a zero`() {
        assertThat(PushBadgePolicy.badge(PushPayload(unreadCount = -3), UserNotificationPreferences(), null)).isEqualTo(0)
    }
}
