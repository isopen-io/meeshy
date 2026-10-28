package me.meeshy.sdk.game

import com.google.common.truth.Truth.assertThat
import io.mockk.every
import io.mockk.mockk
import me.meeshy.sdk.model.ApiNotification
import me.meeshy.sdk.model.MeeshyNotificationType
import me.meeshy.sdk.model.NotificationMetadata
import me.meeshy.sdk.model.game.engagement.EngagementAchievementKey
import me.meeshy.sdk.model.game.engagement.EngagementReveal
import me.meeshy.sdk.model.game.pages.GameDevicePrefs
import me.meeshy.sdk.session.SessionRepository
import org.junit.Test

/**
 * La célébration d'un palier : deux portes (le toucher, l'événement direct), une seule file, une fois par palier et par
 * compte. Rien n'est calculé ici — le palier vient de la charge servie.
 */
class EngagementRevealCoordinatorTest {

    private val voice = NotificationMetadata(achievementKey = "achievement.first_voice")

    private fun notification(
        id: String = "n1",
        type: MeeshyNotificationType = MeeshyNotificationType.ACHIEVEMENT_UNLOCKED,
        metadata: NotificationMetadata? = voice,
    ) = ApiNotification(id = id, type = type.wire, metadata = metadata)

    private class Scenario(
        val coordinator: EngagementRevealCoordinator,
        val prefs: InMemoryGameDevicePrefsStore,
        val memory: InMemoryEngagementRevealMemory,
    )

    private fun scenario(userId: String? = "me", hidden: Boolean = false, memory: InMemoryEngagementRevealMemory = InMemoryEngagementRevealMemory()): Scenario {
        val session = mockk<SessionRepository>()
        every { session.currentUserId } returns userId
        val prefs = InMemoryGameDevicePrefsStore(GameDevicePrefs(hidden = hidden))
        return Scenario(EngagementRevealCoordinator(prefs, session, memory), prefs, memory)
    }

    private val firstVoice = EngagementReveal.Achievement(EngagementAchievementKey.FIRST_VOICE)

    @Test
    fun `an achievement served live is celebrated by itself`() {
        val s = scenario()

        s.coordinator.onLive(notification())

        assertThat(s.coordinator.queue.value.current).isEqualTo(firstVoice)
    }

    @Test
    fun `a streak, a badge or a level served live does not interrupt`() {
        val s = scenario()

        s.coordinator.onLive(notification(type = MeeshyNotificationType.STREAK_MILESTONE, metadata = NotificationMetadata(threshold = 7)))
        s.coordinator.onLive(notification(type = MeeshyNotificationType.LEVEL_UP, metadata = NotificationMetadata(level = 3)))
        s.coordinator.onLive(notification(type = MeeshyNotificationType.BADGE_EARNED, metadata = NotificationMetadata(axisKey = "content.post", threshold = 10)))

        assertThat(s.coordinator.queue.value.isEmpty).isTrue()
    }

    @Test
    fun `tapping the notification of a streak, a badge or a level celebrates it`() {
        val s = scenario()

        s.coordinator.onTapped(notification(type = MeeshyNotificationType.STREAK_MILESTONE, metadata = NotificationMetadata(threshold = 7)))

        assertThat(s.coordinator.queue.value.current).isEqualTo(EngagementReveal.Streak(7))
    }

    @Test
    fun `a payload that does not say what to celebrate celebrates nothing`() {
        val s = scenario()

        s.coordinator.onLive(notification(metadata = NotificationMetadata()))
        s.coordinator.onTapped(notification(type = MeeshyNotificationType.LEVEL_UP, metadata = NotificationMetadata(level = 0)))
        s.coordinator.onLive(notification(type = MeeshyNotificationType.SYSTEM, metadata = voice))

        assertThat(s.coordinator.queue.value.isEmpty).isTrue()
    }

    @Test
    fun `a redelivered event after the card closed is not celebrated again`() {
        val s = scenario()
        s.coordinator.onLive(notification())
        s.coordinator.finish()

        s.coordinator.onLive(notification(id = "n1-again"))

        assertThat(s.coordinator.queue.value.isEmpty).isTrue()
    }

    @Test
    fun `the memory of the account survives a new process and is not shared with another account`() {
        val memory = InMemoryEngagementRevealMemory()
        scenario(userId = "me", memory = memory).coordinator.onLive(notification())

        val relaunched = scenario(userId = "me", memory = memory)
        relaunched.coordinator.onLive(notification())
        val other = scenario(userId = "you", memory = memory)
        other.coordinator.onLive(notification())

        assertThat(relaunched.coordinator.queue.value.isEmpty).isTrue()
        assertThat(other.coordinator.queue.value.current).isEqualTo(firstVoice)
    }

    @Test
    fun `a tap is a request to see it, but it still counts as celebrated for the live door`() {
        val memory = InMemoryEngagementRevealMemory()
        val first = scenario(memory = memory)
        first.coordinator.onTapped(notification())

        val relaunched = scenario(memory = memory)
        relaunched.coordinator.onLive(notification())

        assertThat(first.coordinator.queue.value.current).isEqualTo(firstVoice)
        assertThat(relaunched.coordinator.queue.value.isEmpty).isTrue()
    }

    @Test
    fun `Game hidden removes both doors`() {
        val s = scenario(hidden = true)

        s.coordinator.onLive(notification())
        s.coordinator.onTapped(notification(id = "n2"))

        assertThat(s.coordinator.queue.value.isEmpty).isTrue()
    }

    @Test
    fun `without a signed-in account nothing is celebrated`() {
        val s = scenario(userId = null)

        s.coordinator.onLive(notification())

        assertThat(s.coordinator.queue.value.isEmpty).isTrue()
    }

    @Test
    fun `while an overlay covers the screen the celebrations wait, then play when it leaves`() {
        val s = scenario()
        s.coordinator.suspend(true)

        s.coordinator.onLive(notification())
        assertThat(s.coordinator.queue.value.current).isNull()

        s.coordinator.suspend(false)
        assertThat(s.coordinator.queue.value.current).isEqualTo(firstVoice)
    }

    @Test
    fun `a full queue refuses the extra and leaves it unmarked so it stays acquired, not lost`() {
        val s = scenario()
        listOf("achievement.first_content", "achievement.first_voice", "achievement.editor", "achievement.all_content_types").forEachIndexed { index, key ->
            s.coordinator.onLive(notification(id = "n$index", metadata = NotificationMetadata(achievementKey = key)))
        }

        val queue = s.coordinator.queue.value
        assertThat(1 + queue.waiting.size).isEqualTo(3)
        assertThat(s.memory.hasCelebrated("me", "achievement:achievement.all_content_types")).isFalse()
    }
}
