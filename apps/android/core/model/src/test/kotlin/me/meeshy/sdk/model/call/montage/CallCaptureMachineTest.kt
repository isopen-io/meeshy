package me.meeshy.sdk.model.call.montage

import com.google.common.truth.Truth.assertThat
import org.junit.Test

/**
 * L'état de la capture d'un appel, miroir des gardes de `CallCaptureController` (iOS) : une prise
 * à la fois, un flash par prise, le film qui démarre et s'arrête, l'issue qui s'affiche puis
 * s'efface.
 */
class CallCaptureMachineTest {

    private fun idle() = CallCaptureState()

    @Test
    fun `une prise passe au travail et fait un flash`() {
        val shot = CallCaptureMachine.shoot(idle())

        assertThat(shot).isNotNull()
        assertThat(shot!!.status).isEqualTo(CallCaptureStatus.Working)
        assertThat(shot.flashCount).isEqualTo(1)
    }

    @Test
    fun `une seconde prise pendant le travail est ignoree`() {
        val working = CallCaptureMachine.shoot(idle())!!

        assertThat(CallCaptureMachine.shoot(working)).isNull()
    }

    @Test
    fun `aucune photo ne se prend pendant le film`() {
        val recording = CallCaptureMachine.recordingStarted(idle(), nowMillis = 1_000)!!

        assertThat(CallCaptureMachine.shoot(recording)).isNull()
    }

    @Test
    fun `le film demarre sur l'instant donne et efface l'issue precedente`() {
        val saved = CallCaptureMachine.finished(CallCaptureMachine.shoot(idle())!!, CallCaptureStatus.Saved)

        val recording = CallCaptureMachine.recordingStarted(saved, nowMillis = 42)!!

        assertThat(recording.recordingStartedAtMillis).isEqualTo(42L)
        assertThat(recording.isRecording).isTrue()
        assertThat(recording.status).isEqualTo(CallCaptureStatus.Idle)
    }

    @Test
    fun `un second film ne demarre pas, ni pendant une prise`() {
        val recording = CallCaptureMachine.recordingStarted(idle(), nowMillis = 1)!!
        val working = CallCaptureMachine.shoot(idle())!!

        assertThat(CallCaptureMachine.recordingStarted(recording, nowMillis = 2)).isNull()
        assertThat(CallCaptureMachine.recordingStarted(working, nowMillis = 2)).isNull()
    }

    @Test
    fun `arreter le film passe au travail le temps d'enregistrer`() {
        val recording = CallCaptureMachine.recordingStarted(idle(), nowMillis = 1)!!

        val stopping = CallCaptureMachine.recordingStopped(recording)!!

        assertThat(stopping.isRecording).isFalse()
        assertThat(stopping.status).isEqualTo(CallCaptureStatus.Working)
    }

    @Test
    fun `arreter sans film ne fait rien`() {
        assertThat(CallCaptureMachine.recordingStopped(idle())).isNull()
    }

    @Test
    fun `l'issue s'efface au bout du delai, sauf si une autre l'a remplacee`() {
        val saved = CallCaptureMachine.finished(idle(), CallCaptureStatus.Saved)
        val again = CallCaptureMachine.shoot(saved)!!

        assertThat(CallCaptureMachine.settled(saved, CallCaptureStatus.Saved).status).isEqualTo(CallCaptureStatus.Idle)
        assertThat(CallCaptureMachine.settled(again, CallCaptureStatus.Saved)).isEqualTo(again)
        assertThat(CallCaptureMachine.STATUS_DISPLAY_MILLIS).isEqualTo(2_500L)
    }

    @Test
    fun `seules les issues finales se disent, les refus comme des erreurs`() {
        assertThat(CallCaptureStatus.Idle.isError).isNull()
        assertThat(CallCaptureStatus.Working.isError).isNull()
        assertThat(CallCaptureStatus.Saved.isError).isFalse()
        assertThat(CallCaptureStatus.VideoSaved.isError).isFalse()
        assertThat(CallCaptureStatus.FacesSaved(2).isError).isFalse()
        assertThat(CallCaptureStatus.Denied.isError).isTrue()
        assertThat(CallCaptureStatus.NoVideo.isError).isTrue()
        assertThat(CallCaptureStatus.Failed.isError).isTrue()
    }
}
