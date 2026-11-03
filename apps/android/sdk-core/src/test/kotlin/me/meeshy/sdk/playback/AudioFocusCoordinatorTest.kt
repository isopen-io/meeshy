package me.meeshy.sdk.playback

import app.cash.turbine.test
import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.advanceTimeBy
import kotlinx.coroutines.test.runTest
import me.meeshy.sdk.model.playback.ContentPlaybackAudibility
import me.meeshy.sdk.model.playback.MediaSessionEvent
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class AudioFocusCoordinatorTest {

    private class Rig(scope: TestScope, var callActive: Boolean = false) {
        val system = FakeFocusSystem()
        val noisy = FakeNoisySource()
        val interruption = PlaybackInterruptionState()
        val coordinator = AudioFocusCoordinator(
            system = system,
            noisy = noisy,
            interruption = interruption,
            isCallActive = { callActive },
            dispatcher = StandardTestDispatcher(scope.testScheduler),
        )
    }

    @Test
    fun `un vocal audible demande le focus et un media muet n'en demande aucun`() = runTest {
        val rig = Rig(this)

        assertThat(rig.coordinator.requestPlayback(ContentPlaybackAudibility.Muted)).isTrue()
        assertThat(rig.system.requests).isEmpty()

        assertThat(rig.coordinator.requestPlayback(ContentPlaybackAudibility.Audible)).isTrue()
        assertThat(rig.system.requests).containsExactly(FocusKind.Playback)
    }

    @Test
    fun `un refus du systeme empeche le demarrage`() = runTest {
        val rig = Rig(this)
        rig.system.grants = false

        assertThat(rig.coordinator.requestPlayback(ContentPlaybackAudibility.Audible)).isFalse()
        assertThat(rig.coordinator.holdsFocus).isFalse()
    }

    @Test
    fun `le coordinateur ne dispute pas le focus a un appel Meeshy`() = runTest {
        val rig = Rig(this, callActive = true)

        assertThat(rig.coordinator.requestPlayback(ContentPlaybackAudibility.Audible)).isFalse()
        assertThat(rig.system.requests).isEmpty()
    }

    @Test
    fun `perte transitoire puis gain annonce l'interruption puis la reprise`() = runTest {
        val rig = Rig(this)
        rig.coordinator.requestPlayback(ContentPlaybackAudibility.Audible)

        rig.coordinator.events.test {
            rig.coordinator.onFocusChange(FocusChange.LossTransient)
            assertThat(awaitItem()).isEqualTo(MediaSessionEvent.InterruptionBegan)
            assertThat(rig.interruption.current.value.cause).isEqualTo(InterruptionCause.Focus)

            rig.coordinator.onFocusChange(FocusChange.Gain)
            assertThat(awaitItem()).isEqualTo(MediaSessionEvent.InterruptionEndedShouldResume)
            assertThat(rig.interruption.current.value.isInterrupted).isFalse()
        }
    }

    @Test
    fun `perte definitive, pause sans reprise automatique`() = runTest {
        val rig = Rig(this)
        rig.coordinator.requestPlayback(ContentPlaybackAudibility.Audible)

        rig.coordinator.events.test {
            rig.coordinator.onFocusChange(FocusChange.Loss)
            assertThat(awaitItem()).isEqualTo(MediaSessionEvent.InterruptionBegan)
            assertThat(awaitItem()).isEqualTo(MediaSessionEvent.InterruptionEndedShouldNotResume)
        }
        assertThat(rig.coordinator.holdsFocus).isFalse()
    }

    @Test
    fun `perte avec ducking baisse le volume puis le rend`() = runTest {
        val rig = Rig(this)
        rig.coordinator.requestPlayback(ContentPlaybackAudibility.Audible)

        rig.coordinator.onFocusChange(FocusChange.LossTransientCanDuck)
        assertThat(rig.coordinator.ducked.value).isTrue()

        rig.coordinator.onFocusChange(FocusChange.Gain)
        assertThat(rig.coordinator.ducked.value).isFalse()
    }

    @Test
    fun `debrancher les ecouteurs met en pause`() = runTest {
        val rig = Rig(this)
        rig.coordinator.requestPlayback(ContentPlaybackAudibility.Audible)

        rig.coordinator.events.test {
            rig.noisy.unplug()
            assertThat(awaitItem()).isEqualTo(MediaSessionEvent.RouteChangedOldDeviceUnavailable)
        }
    }

    @Test
    fun `le focus est rendu trois secondes apres une pause utilisateur`() = runTest {
        val rig = Rig(this)
        rig.coordinator.requestPlayback(ContentPlaybackAudibility.Audible)

        rig.coordinator.onUserPaused()
        advanceTimeBy(2_900)
        assertThat(rig.system.abandoned).isEmpty()

        advanceTimeBy(200)
        assertThat(rig.system.abandoned).containsExactly(FocusKind.Playback)
        assertThat(rig.noisy.unregistered).isEqualTo(1)
    }

    @Test
    fun `une relance annule la liberation du focus`() = runTest {
        val rig = Rig(this)
        rig.coordinator.requestPlayback(ContentPlaybackAudibility.Audible)
        rig.coordinator.onUserPaused()
        advanceTimeBy(1_000)

        rig.coordinator.requestPlayback(ContentPlaybackAudibility.Audible)
        advanceTimeBy(5_000)

        assertThat(rig.system.abandoned).isEmpty()
        assertThat(rig.coordinator.holdsFocus).isTrue()
    }

    @Test
    fun `la fin de lecture rend le focus tout de suite`() = runTest {
        val rig = Rig(this)
        rig.coordinator.requestPlayback(ContentPlaybackAudibility.Audible)

        rig.coordinator.release()

        assertThat(rig.system.abandoned).containsExactly(FocusKind.Playback)
    }

    @Test
    fun `un enregistrement en cours ne fait pas interrompre les lecteurs`() = runTest {
        val rig = Rig(this)
        rig.coordinator.requestPlayback(ContentPlaybackAudibility.Audible)
        rig.coordinator.setRecordingHold(true)

        rig.coordinator.onFocusChange(FocusChange.LossTransient)

        assertThat(rig.interruption.current.value.isInterrupted).isFalse()
    }
}
