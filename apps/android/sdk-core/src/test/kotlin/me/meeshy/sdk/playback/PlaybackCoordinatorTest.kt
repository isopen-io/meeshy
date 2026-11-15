package me.meeshy.sdk.playback

import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.test.runTest
import org.junit.Test

class PlaybackCoordinatorTest {

    @Test
    fun `un lecteur qui demarre eteint tous les autres mais pas lui`() {
        val coordinator = PlaybackCoordinator()
        val voice = FakePlayer(playing = true).also(coordinator::register)
        val video = FakePlayer(CoordinatedPlayerKind.Video, playing = true).also(coordinator::register)
        val starting = FakePlayer().also(coordinator::register)

        coordinator.willStartPlaying(starting)

        assertThat(voice.stops).isEqualTo(1)
        assertThat(video.stops).isEqualTo(1)
        assertThat(starting.stops).isEqualTo(0)
    }

    @Test
    fun `stopAll eteint tout et stopAudioOnly garde la video`() {
        val coordinator = PlaybackCoordinator()
        val voice = FakePlayer(playing = true).also(coordinator::register)
        val external = FakePlayer(CoordinatedPlayerKind.External, playing = true).also(coordinator::register)
        val video = FakePlayer(CoordinatedPlayerKind.Video, playing = true).also(coordinator::register)

        coordinator.stopAudioOnly()

        assertThat(voice.stops).isEqualTo(1)
        assertThat(external.stops).isEqualTo(1)
        assertThat(video.stops).isEqualTo(0)

        coordinator.stopAll()

        assertThat(video.stops).isEqualTo(1)
    }

    @Test
    fun `isAnyPlaying et isAnyAudioPlaying distinguent la video`() {
        val coordinator = PlaybackCoordinator()
        assertThat(coordinator.isAnyPlaying).isFalse()
        val video = FakePlayer(CoordinatedPlayerKind.Video, playing = true).also(coordinator::register)

        assertThat(coordinator.isAnyPlaying).isTrue()
        assertThat(coordinator.isAnyAudioPlaying).isFalse()

        video.playing = false
        FakePlayer(playing = true).also(coordinator::register)

        assertThat(coordinator.isAnyAudioPlaying).isTrue()
    }

    @Test
    fun `un lecteur desinscrit n'est plus eteint`() {
        val coordinator = PlaybackCoordinator()
        val voice = FakePlayer(playing = true).also(coordinator::register)
        coordinator.unregister(voice)

        coordinator.stopAll()

        assertThat(voice.stops).isEqualTo(0)
    }

    @Test
    fun `le fondu n'atteint que les lecteurs externes`() = runTest {
        val coordinator = PlaybackCoordinator()
        val voice = FakePlayer(playing = true).also(coordinator::register)
        val external = FakePlayer(CoordinatedPlayerKind.External, playing = true).also(coordinator::register)

        coordinator.fadeOutAllExternal(durationMs = 200)

        assertThat(external.stops).isEqualTo(1)
        assertThat(voice.stops).isEqualTo(0)
    }

    @Test
    fun `les volumes audibles sont ceux des lecteurs qui jouent`() {
        val coordinator = PlaybackCoordinator()
        val loud = FakeVolume(1f)
        val silent = FakeVolume(1f)
        FakePlayer(playing = true, volumeTarget = loud).also(coordinator::register)
        FakePlayer(playing = false, volumeTarget = silent).also(coordinator::register)

        assertThat(coordinator.audibleVolumeTargets).containsExactly(loud)
    }
}
