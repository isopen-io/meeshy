package me.meeshy.sdk.model.game.engagement

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.MeeshyNotificationType
import me.meeshy.sdk.model.NotificationMetadata
import org.junit.Test

class EngagementRevealTest {

    private fun from(type: MeeshyNotificationType, md: NotificationMetadata?) = EngagementReveal.from(type, md)

    @Test
    fun `un succes historique se celebre sous sa cle`() {
        val r = from(MeeshyNotificationType.ACHIEVEMENT_UNLOCKED, NotificationMetadata(achievementKey = "achievement.first_voice"))

        assertThat(r).isEqualTo(EngagementReveal.Achievement(EngagementAchievementKey.FIRST_VOICE))
        assertThat(r!!.id).isEqualTo("achievement:achievement.first_voice")
    }

    @Test
    fun `la cle legacy en majuscules compte pour la moderne`() {
        val r = from(MeeshyNotificationType.LEGACY_ACHIEVEMENT_UNLOCKED, NotificationMetadata(achievementKey = "achievement.editor"))

        assertThat(r).isEqualTo(EngagementReveal.Achievement(EngagementAchievementKey.EDITOR))
    }

    @Test
    fun `un succes de la grammaire porte sa famille et son palier`() {
        val key = "achievement.cercles.conversation.join.size:1000"
        val r = from(MeeshyNotificationType.ACHIEVEMENT_UNLOCKED, NotificationMetadata(achievementKey = key))

        assertThat(r).isInstanceOf(EngagementReveal.ComposedAchievement::class.java)
        assertThat((r as EngagementReveal.ComposedAchievement).tier).isEqualTo(1000)
        assertThat(r.id).isEqualTo("achievement:$key")
    }

    @Test
    fun `une cle hors famille ou hors echelle ne fabrique rien`() {
        listOf(
            "achievement.cercles.conversation.join.size:42",
            "achievement.nope.x.y.count:1",
            "garbage",
            "achievement.cercles.conversation.join.size:abc",
        ).forEach {
            assertThat(from(MeeshyNotificationType.ACHIEVEMENT_UNLOCKED, NotificationMetadata(achievementKey = it))).isNull()
        }
        assertThat(from(MeeshyNotificationType.ACHIEVEMENT_UNLOCKED, NotificationMetadata())).isNull()
    }

    @Test
    fun `un badge se celebre par son axe et son seuil`() {
        val r = from(MeeshyNotificationType.BADGE_EARNED, NotificationMetadata(axisKey = "content.post", threshold = 50))

        assertThat(r).isEqualTo(EngagementReveal.Badge("content.post", 50))
        assertThat(r!!.id).isEqualTo("badge:content.post:50")
    }

    @Test
    fun `un badge sans axe ou sans seuil positif rend null`() {
        assertThat(from(MeeshyNotificationType.BADGE_EARNED, NotificationMetadata(axisKey = "", threshold = 5))).isNull()
        assertThat(from(MeeshyNotificationType.BADGE_EARNED, NotificationMetadata(axisKey = "content.post", threshold = 0))).isNull()
        assertThat(from(MeeshyNotificationType.BADGE_EARNED, NotificationMetadata(axisKey = "content.post"))).isNull()
    }

    @Test
    fun `un level_up celebre le rang et jamais le seuil`() {
        val r = from(MeeshyNotificationType.LEVEL_UP, NotificationMetadata(threshold = 400, level = 4))

        assertThat(r).isEqualTo(EngagementReveal.Level(4))
        assertThat(from(MeeshyNotificationType.LEVEL_UP, NotificationMetadata(threshold = 400))).isNull()
    }

    @Test
    fun `une serie se celebre par ses jours`() {
        assertThat(from(MeeshyNotificationType.STREAK_MILESTONE, NotificationMetadata(threshold = 30)))
            .isEqualTo(EngagementReveal.Streak(30))
        assertThat(from(MeeshyNotificationType.STREAK_MILESTONE, NotificationMetadata(threshold = 0))).isNull()
    }

    @Test
    fun `un autre type de notification ne celebre rien`() {
        assertThat(from(MeeshyNotificationType.SYSTEM, NotificationMetadata(threshold = 3, level = 3))).isNull()
        assertThat(from(MeeshyNotificationType.LEVEL_UP, null)).isNull()
    }

    @Test
    fun `seul un succes se celebre tout seul`() {
        assertThat(EngagementReveal.Achievement(EngagementAchievementKey.EDITOR).celebratesUnprompted).isTrue()
        assertThat(EngagementReveal.Badge("content.post", 1).celebratesUnprompted).isFalse()
        assertThat(EngagementReveal.Streak(3).celebratesUnprompted).isFalse()
        assertThat(EngagementReveal.Level(1).celebratesUnprompted).isFalse()
    }

    @Test
    fun `cinq types annoncent un palier`() {
        assertThat(EngagementReveal.announcingTypes).hasSize(5)
    }
}
