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

    private val on = UserNotificationPreferences()

    @Test
    fun `une premiere banniere compte un message`() {
        assertThat(PushBadgePolicy.bannerCount(on, previous = null)).isEqualTo(1)
    }

    @Test
    fun `chaque message de plus allonge le nombre de la meme banniere`() {
        assertThat(PushBadgePolicy.bannerCount(on, previous = 1)).isEqualTo(2)
        assertThat(PushBadgePolicy.bannerCount(on, previous = 4)).isEqualTo(5)
    }

    @Test
    fun `une correction de texte ne compte pas un message de plus`() {
        assertThat(PushBadgePolicy.bannerCount(on, previous = 3, addsMessage = false)).isEqualTo(3)
        assertThat(PushBadgePolicy.bannerCount(on, previous = null, addsMessage = false)).isEqualTo(1)
    }

    @Test
    fun `badges coupes effacent le nombre`() {
        val prefs = UserNotificationPreferences(notificationBadgeEnabled = false)

        assertThat(PushBadgePolicy.bannerCount(prefs, previous = 4)).isEqualTo(0)
    }

    @Test
    fun `un nombre precedent negatif est ramene a zero`() {
        assertThat(PushBadgePolicy.bannerCount(on, previous = -3)).isEqualTo(1)
    }
}
