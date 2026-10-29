package me.meeshy.sdk.game

import com.google.common.truth.Truth.assertThat
import io.mockk.every
import io.mockk.mockk
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.runTest
import me.meeshy.sdk.model.ApiNotification
import me.meeshy.sdk.model.MeeshyUser
import me.meeshy.sdk.model.NotificationMetadata
import me.meeshy.sdk.model.game.engagement.EngagementAchievementKey
import me.meeshy.sdk.model.game.engagement.EngagementReveal
import me.meeshy.sdk.model.game.pages.GameDevicePrefs
import me.meeshy.sdk.session.SessionRepository
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class EngagementRevealPresenceBindingTest {

    private class Rig(
        val coordinator: EngagementRevealCoordinator,
        val onboarding: OnboardingPresence,
        val moment: GameMomentPresence,
        val binding: EngagementRevealPresenceBinding,
    )

    private fun rig(): Rig {
        val account = MutableStateFlow<MeeshyUser?>(MeeshyUser(id = "me", username = "me"))
        val session = mockk<SessionRepository>()
        every { session.currentUserId } answers { account.value?.id }
        every { session.currentUser } returns account
        val coordinator = EngagementRevealCoordinator(InMemoryGameDevicePrefsStore(GameDevicePrefs()), session, InMemoryEngagementRevealMemory())
        val onboarding = OnboardingPresence()
        val moment = GameMomentPresence()
        return Rig(coordinator, onboarding, moment, EngagementRevealPresenceBinding(coordinator, onboarding, moment, UnconfinedTestDispatcher()))
    }

    private val voice = ApiNotification(id = "n1", type = "achievement_unlocked", metadata = NotificationMetadata(achievementKey = "achievement.first_voice"))
    private val firstVoice = EngagementReveal.Achievement(EngagementAchievementKey.FIRST_VOICE)

    @Test
    fun `un palier tombe pendant l'onboarding attend, puis se joue quand le calque part`() = runTest {
        val r = rig()
        r.binding.attach()
        r.onboarding.update(true)

        r.coordinator.onLive(voice)

        assertThat(r.coordinator.queue.value.current).isNull()
        assertThat(r.coordinator.queue.value.waiting).containsExactly(firstVoice)
        assertThat(r.moment.isPresented.value).isFalse()

        r.onboarding.update(false)

        assertThat(r.coordinator.queue.value.current).isEqualTo(firstVoice)
        assertThat(r.moment.isPresented.value).isTrue()
        r.binding.detach()
    }

    @Test
    fun `la celebration a l'ecran se declare puis retombe a la fermeture`() = runTest {
        val r = rig()
        r.binding.attach()

        r.coordinator.onLive(voice)
        assertThat(r.moment.isPresented.value).isTrue()

        r.coordinator.finish()
        assertThat(r.moment.isPresented.value).isFalse()
        r.binding.detach()
    }

    @Test
    fun `detache, la presence retombe meme avec une celebration a l'ecran`() = runTest {
        val r = rig()
        r.binding.attach()
        r.coordinator.onLive(voice)

        r.binding.detach()

        assertThat(r.moment.isPresented.value).isFalse()
    }
}
