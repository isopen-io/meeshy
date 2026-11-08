package me.meeshy.sdk.playback

import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.runTest
import me.meeshy.sdk.model.playback.MediaSessionEvent
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class AudioEngineCoordinationTest {

    private class Rig(scope: TestScope) {
        val port = FakeAudioPlayerPort()
        val coordinator = PlaybackCoordinator()
        var call = false
        val engine = Media3AudioPlaybackEngine(
            portFactory = { port },
            positions = InMemoryPositionStore(),
            reportSink = RecordingSink(),
            callActive = { call },
            dispatcher = StandardTestDispatcher(scope.testScheduler),
            nowEpochMs = { 1_000L },
            coordinator = coordinator,
        ).also(coordinator::register)
    }

    private fun coordinationTest(body: suspend TestScope.(Rig) -> Unit) = runTest {
        val rig = Rig(this)
        try {
            body(rig)
        } finally {
            rig.engine.release()
        }
    }

    @Test
    fun `demarrer un vocal eteint un autre lecteur du registre`() = coordinationTest { rig ->
        val other = FakePlayer(CoordinatedPlayerKind.Video, playing = true).also(rig.coordinator::register)

        rig.engine.play("a", "https://cdn/a.mp3", isProtected = false)

        assertThat(other.stops).isEqualTo(1)
    }

    @Test
    fun `un appel met le vocal en pause puis le raccrochage le reprend`() = coordinationTest { rig ->
        rig.engine.play("a", "https://cdn/a.mp3", isProtected = false)
        rig.port.prepare(30_000L)
        assertThat(rig.engine.state.value.isPlaying).isTrue()

        rig.coordinator.interruptAllForCall()
        assertThat(rig.engine.state.value.isPlaying).isFalse()

        rig.coordinator.dispatchSessionEvent(MediaSessionEvent.CallEndedShouldResume)
        assertThat(rig.engine.state.value.isPlaying).isTrue()
    }

    @Test
    fun `une pause de l'utilisateur pendant l'interruption empeche la reprise`() = coordinationTest { rig ->
        rig.engine.play("a", "https://cdn/a.mp3", isProtected = false)
        rig.port.prepare(30_000L)
        rig.coordinator.interruptAllForCall()

        rig.engine.pause()
        rig.coordinator.dispatchSessionEvent(MediaSessionEvent.CallEndedShouldResume)

        assertThat(rig.engine.state.value.isPlaying).isFalse()
    }

    @Test
    fun `un vocal en pause avant l'appel ne reprend pas au raccrochage`() = coordinationTest { rig ->
        rig.engine.play("a", "https://cdn/a.mp3", isProtected = false)
        rig.port.prepare(30_000L)
        rig.engine.pause()

        rig.coordinator.interruptAllForCall()
        rig.coordinator.dispatchSessionEvent(MediaSessionEvent.CallEndedShouldResume)

        assertThat(rig.engine.state.value.isPlaying).isFalse()
    }
}
