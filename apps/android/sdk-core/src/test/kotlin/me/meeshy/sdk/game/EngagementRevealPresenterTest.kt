package me.meeshy.sdk.game

import com.google.common.truth.Truth.assertThat
import io.mockk.coEvery
import io.mockk.every
import io.mockk.mockk
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.test.runTest
import me.meeshy.sdk.engagement.EngagementProgressRepository
import me.meeshy.sdk.model.ApiNotification
import me.meeshy.sdk.model.MeeshyUser
import me.meeshy.sdk.model.NotificationMetadata
import me.meeshy.sdk.model.game.AchievementRarity
import me.meeshy.sdk.model.game.GameRarityEntry
import me.meeshy.sdk.model.game.pages.GameDevicePrefs
import me.meeshy.sdk.session.SessionRepository
import org.junit.Test

class EngagementRevealPresenterTest {

    private val epic = GameRarityEntry(AchievementRarity.Epic, holders = 4000, population = 100_000)
    private val voice = ApiNotification(id = "n1", type = "achievement_unlocked", metadata = NotificationMetadata(achievementKey = "achievement.first_voice"))

    private fun presenter(
        prefs: GameDevicePrefs = GameDevicePrefs(),
        rarities: Map<String, GameRarityEntry>? = mapOf("achievement.first_voice" to epic),
        user: MeeshyUser = MeeshyUser(id = "me", username = "alice"),
        coordinatorPrefs: GameDevicePrefs = prefs,
    ): Pair<EngagementRevealPresenter, EngagementRevealCoordinator> {
        val account = MutableStateFlow<MeeshyUser?>(user)
        val session = mockk<SessionRepository>()
        every { session.currentUserId } answers { account.value?.id }
        every { session.currentUser } returns account
        val store = InMemoryGameDevicePrefsStore(coordinatorPrefs)
        val coordinator = EngagementRevealCoordinator(store, session, InMemoryEngagementRevealMemory())
        val progress = mockk<EngagementProgressRepository>()
        coEvery { progress.cachedRarities() } returns rarities
        return EngagementRevealPresenter(coordinator, progress, store, session) to coordinator
    }

    @Test
    fun `la celebration porte la rarete du cache, l'offre de carte et le pseudo public`() = runTest {
        val (presenter, coordinator) = presenter()
        coordinator.onLive(voice)

        val shown = presenter.presentation.first { it != null }!!

        assertThat(shown.rarity).isEqualTo(epic)
        assertThat(shown.offersPhotos).isTrue()
        assertThat(shown.authorHandle).isEqualTo("alice")
    }

    @Test
    fun `sans rarete au cache la celebration reste celle d'avant`() = runTest {
        val (presenter, coordinator) = presenter(rarities = null)
        coordinator.onLive(voice)

        assertThat(presenter.presentation.first { it != null }!!.rarity).isNull()
    }

    @Test
    fun `Celebrations coupees retire la carte a partager mais garde le liseré`() = runTest {
        val (presenter, coordinator) = presenter(prefs = GameDevicePrefs(celebrations = false))
        coordinator.onLive(voice)

        val shown = presenter.presentation.first { it != null }!!

        assertThat(shown.offersPhotos).isFalse()
        assertThat(shown.rarity).isEqualTo(epic)
    }

    @Test
    fun `un invite n'a pas de plaque d'auteur`() = runTest {
        val (presenter, coordinator) = presenter(user = MeeshyUser(id = "g", username = "guest42", isAnonymous = true))
        coordinator.onLive(voice)

        assertThat(presenter.presentation.first { it != null }!!.authorHandle).isNull()
    }
}
