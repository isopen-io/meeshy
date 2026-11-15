package me.meeshy.sdk.model.recording

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.media.MediaPermissionState
import org.junit.Test

class AudioRecorderScreenLawTest {
    private fun reduce(state: RecorderScreenState, event: RecorderScreenEvent) = AudioRecorderScreenLaw.reduce(state, event)

    private val ready = RecorderScreenState()
    private val recording = RecorderScreenState(RecorderPhase.RECORDING)

    @Test
    fun `un micro ouvert passe en enregistrement avec une haptique moyenne`() {
        val t = reduce(ready, RecorderScreenEvent.Started(live = true))
        assertThat(t.state.phase).isEqualTo(RecorderPhase.RECORDING)
        assertThat(t.haptic).isEqualTo(RecorderHaptic.MEDIUM)
    }

    @Test
    fun `un micro qui refuse de s'ouvrir laisse l'ecran pret sans haptique`() {
        val t = reduce(ready, RecorderScreenEvent.Started(live = false))
        assertThat(t.state.phase).isEqualTo(RecorderPhase.READY)
        assertThat(t.haptic).isNull()
    }

    @Test
    fun `une prise gardee ouvre l'apercu avec une haptique de succes`() {
        val t = reduce(recording, RecorderScreenEvent.Finished(kept = true))
        assertThat(t.state.isPreviewing).isTrue()
        assertThat(t.haptic).isEqualTo(RecorderHaptic.SUCCESS)
    }

    @Test
    fun `une prise trop courte revient a l'etat pret`() {
        val t = reduce(recording, RecorderScreenEvent.Finished(kept = false))
        assertThat(t.state).isEqualTo(ready)
        assertThat(t.haptic).isNull()
    }

    @Test
    fun `une fin hors prise est ignoree`() {
        val t = reduce(ready, RecorderScreenEvent.Finished(kept = true))
        assertThat(t.state).isEqualTo(ready)
    }

    @Test
    fun `annuler ou refaire revient a l'etat pret`() {
        assertThat(reduce(recording, RecorderScreenEvent.Cancelled).state).isEqualTo(ready)
        assertThat(reduce(RecorderScreenState(RecorderPhase.PREVIEW), RecorderScreenEvent.Redo).state).isEqualTo(ready)
    }

    @Test
    fun `un refus simple et un refus definitif s'expliquent differemment`() {
        assertThat(reduce(ready, RecorderScreenEvent.PermissionResolved(MediaPermissionState.NOT_DETERMINED)).state.refusal)
            .isEqualTo(MicRefusal.DENIED)
        assertThat(reduce(ready, RecorderScreenEvent.PermissionResolved(MediaPermissionState.DENIED)).state.refusal)
            .isEqualTo(MicRefusal.NEEDS_SETTINGS)
        assertThat(reduce(ready, RecorderScreenEvent.PermissionResolved(MediaPermissionState.RESTRICTED)).state.refusal)
            .isEqualTo(MicRefusal.NEEDS_SETTINGS)
    }

    @Test
    fun `un micro accorde efface le refus precedent`() {
        val refused = RecorderScreenState(refusal = MicRefusal.NEEDS_SETTINGS)
        assertThat(reduce(refused, RecorderScreenEvent.PermissionResolved(MediaPermissionState.GRANTED)).state.refusal).isNull()
    }
}
