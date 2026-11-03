package me.meeshy.app.reels

import com.google.common.truth.Truth.assertThat
import io.mockk.every
import io.mockk.mockk
import me.meeshy.sdk.cache.CacheClock
import me.meeshy.sdk.chrome.InMemoryFloatingButtonPositionStore
import me.meeshy.sdk.model.PrivacyPreferences
import me.meeshy.sdk.net.MeeshyConfig
import me.meeshy.sdk.playback.CoordinatedPlayer
import me.meeshy.sdk.playback.CoordinatedPlayerKind
import me.meeshy.sdk.playback.PlaybackCoordinator
import me.meeshy.sdk.privacy.InMemoryPrivacyPreferencesStore
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.setMain
import org.junit.After
import org.junit.Before
import org.junit.Test

/** La fermeture du lecteur coupe tout ce qui joue (vidéo partagée et réel-audio) avant que le disque ne se referme. */
class ReelsScreenCloseTest {

    @Before
    fun setUp() {
        Dispatchers.setMain(StandardTestDispatcher())
    }

    @After
    fun tearDown() {
        Dispatchers.resetMain()
    }

    private class FakePlayer(override val kind: CoordinatedPlayerKind) : CoordinatedPlayer {
        var stopped = 0
        override val isPlayingAudibly: Boolean get() = stopped == 0
        override fun stop() {
            stopped++
        }
    }

    private fun viewModel(coordinator: PlaybackCoordinator, feedStorage: String = "0.0,0.0"): ReelsViewModel {
        val clock = object : CacheClock {
            override fun nowMillis(): Long = 0L
        }
        return ReelsViewModel(
            mockk(relaxed = true), mockk(relaxed = true) { every { currentUserId } returns "me" }, mockk(relaxed = true),
            MeeshyConfig(), clock, InMemoryPrivacyPreferencesStore(PrivacyPreferences()), mockk(relaxed = true),
            playbackCoordinator = coordinator,
            floatingButtonPositions = InMemoryFloatingButtonPositionStore(left = feedStorage),
        )
    }

    @Test
    fun `fermer coupe la video et l'audio qui jouent`() {
        val coordinator = PlaybackCoordinator()
        val video = FakePlayer(CoordinatedPlayerKind.Video)
        val audio = FakePlayer(CoordinatedPlayerKind.Audio)
        coordinator.register(video)
        coordinator.register(audio)

        viewModel(coordinator).stopAllMedia()

        assertThat(video.stopped).isEqualTo(1)
        assertThat(audio.stopped).isEqualTo(1)
    }

    @Test
    fun `le devoilement lit la place persistee du bouton Flux`() {
        assertThat(viewModel(PlaybackCoordinator(), feedStorage = "v3,L,0.5").feedButtonStorage.value).isEqualTo("v3,L,0.5")
    }
}
