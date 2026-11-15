package me.meeshy.sdk.audioedit

import com.google.common.truth.Truth.assertThat
import java.io.File
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.advanceTimeBy
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import me.meeshy.sdk.model.audioedit.AudioEditorTool
import me.meeshy.sdk.model.audioedit.AudioTranscriptionFailure
import me.meeshy.sdk.model.audioedit.AudioTranscriptionState
import me.meeshy.sdk.model.speech.OnDeviceTranscription
import me.meeshy.sdk.model.speech.TranscriptionError
import me.meeshy.sdk.model.speech.TranscriptionException
import me.meeshy.sdk.speech.SoundTranscriptionOutcome
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class AudioEditorTranscriptionTest {

    private val dispatcher = UnconfinedTestDispatcher()

    private fun heard(text: String) =
        SoundTranscriptionOutcome.Heard(OnDeviceTranscription(text = text, language = "fr", confidence = 0.9))

    private fun controller(scope: TestScope, transcriber: AudioTranscriber?, language: String = "fr") = AudioEditorController(
        source = sourceFile(),
        root = tempDir(),
        engine = AudioEditEngine(FakeProbe(), FakeRunner(), dispatcher),
        durations = AudioDurationReader { 10.0 },
        ioDispatcher = dispatcher,
        scope = scope.backgroundScope,
        transcriber = transcriber,
        defaultLanguage = language,
    )

    @Test
    fun `sans reconnaissance l'outil Transcrire est absent`() = runTest {
        val c = controller(this, transcriber = null)
        assertThat(c.canTranscribe).isFalse()
        c.prepare()
        c.transcribe().join()
        assertThat(c.state.value.transcription).isEqualTo(AudioTranscriptionState.Idle)
    }

    @Test
    fun `la transcription passe de repos à en cours puis à terminé avec la langue choisie`() = runTest {
        val gate = CompletableDeferred<Unit>()
        val seen = mutableListOf<Pair<File, String>>()
        val c = controller(this, AudioTranscriber { file, language -> seen += file to language; gate.await(); heard("  bonjour ") })
        c.prepare()
        c.setTranscriptionLanguage("es")
        val job = c.transcribe()
        runCurrent()
        assertThat(c.state.value.transcription).isEqualTo(AudioTranscriptionState.Running)
        gate.complete(Unit)
        job.join()
        assertThat(c.state.value.transcription).isEqualTo(AudioTranscriptionState.Done("bonjour", "es"))
        assertThat(seen.single().first).isEqualTo(c.activeFile)
        assertThat(seen.single().second).isEqualTo("es")
    }

    @Test
    fun `un texte vide est une absence de parole`() = runTest {
        val c = controller(this, AudioTranscriber { _, _ -> heard("   ") })
        c.prepare()
        c.transcribe().join()
        assertThat(c.state.value.transcription).isEqualTo(AudioTranscriptionState.Failed(AudioTranscriptionFailure.NO_SPEECH))
    }

    @Test
    fun `un fichier introuvable se dit sans lancer la reconnaissance`() = runTest {
        var calls = 0
        val c = controller(this, AudioTranscriber { _, _ -> calls++; heard("x") })
        c.prepare()
        c.activeFile!!.delete()
        c.transcribe().join()
        assertThat(c.state.value.transcription).isEqualTo(AudioTranscriptionState.Failed(AudioTranscriptionFailure.FILE_MISSING))
        assertThat(calls).isEqualTo(0)
    }

    @Test
    fun `un fichier vide se dit`() = runTest {
        val c = controller(this, AudioTranscriber { _, _ -> heard("x") })
        c.prepare()
        c.activeFile!!.writeBytes(ByteArray(0))
        c.transcribe().join()
        assertThat(c.state.value.transcription).isEqualTo(AudioTranscriptionState.Failed(AudioTranscriptionFailure.EMPTY))
    }

    @Test
    fun `le refus de la permission est un état à part`() = runTest {
        val c = controller(this, AudioTranscriber { _, _ -> throw TranscriptionException(TranscriptionError.PermissionDenied) })
        c.prepare()
        c.transcribe().join()
        assertThat(c.state.value.transcription).isEqualTo(AudioTranscriptionState.PermissionDenied)
    }

    @Test
    fun `un plantage du reconnaisseur ne plante pas l'éditeur`() = runTest {
        val c = controller(this, AudioTranscriber { _, _ -> error("boom") })
        c.prepare()
        c.transcribe().join()
        assertThat(c.state.value.transcription).isEqualTo(AudioTranscriptionState.Failed(AudioTranscriptionFailure.FAILED))
    }

    @Test
    fun `l'appareil qui laisse la passerelle transcrire n'est pas un succès`() = runTest {
        val c = controller(this, AudioTranscriber { _, _ -> SoundTranscriptionOutcome.ServerWillTranscribe })
        c.prepare()
        c.transcribe().join()
        assertThat(c.state.value.transcription).isEqualTo(AudioTranscriptionState.Failed(AudioTranscriptionFailure.FAILED))
    }

    @Test
    fun `un reconnaisseur qui ne finit jamais est forcé à échouer après le délai`() = runTest {
        val c = controller(this, AudioTranscriber { _, _ -> CompletableDeferred<Unit>().await(); heard("x") })
        c.prepare()
        val job = c.transcribe()
        runCurrent()
        advanceTimeBy(AudioEditorController.TRANSCRIPTION_TIMEOUT_MS + 1)
        job.join()
        assertThat(c.state.value.transcription).isEqualTo(AudioTranscriptionState.Failed(AudioTranscriptionFailure.FAILED))
    }

    @Test
    fun `relancer annule la reconnaissance précédente`() = runTest {
        val first = CompletableDeferred<Unit>()
        var call = 0
        val c = controller(this, AudioTranscriber { _, _ ->
            if (call++ == 0) { first.await(); heard("ancien") } else heard("nouveau")
        })
        c.prepare()
        val older = c.transcribe()
        runCurrent()
        c.transcribe().join()
        older.join()
        assertThat(older.isCancelled).isTrue()
        assertThat(c.state.value.transcription).isEqualTo(AudioTranscriptionState.Done("nouveau", "fr"))
    }

    @Test
    fun `changer de version invalide la transcription, qui n'est pas une version`() = runTest {
        val c = controller(this, AudioTranscriber { _, _ -> heard("bonjour") })
        c.prepare()
        c.transcribe().join()
        c.setMode(me.meeshy.sdk.model.audioedit.AudioEditorMode.PRO)
        c.selectTool(AudioEditorTool.VOLUME)
        c.update { it.copy(gain = 2.0) }
        c.apply().join()
        assertThat(c.state.value.transcription).isEqualTo(AudioTranscriptionState.Idle)
        assertThat(c.state.value.document!!.versions).hasSize(2)
    }

    @Test
    fun `quitter l'éditeur arrête la reconnaissance en vol`() = runTest {
        val c = controller(this, AudioTranscriber { _, _ -> CompletableDeferred<Unit>().await(); heard("x") })
        c.prepare()
        val job = c.transcribe()
        runCurrent()
        c.cancelBackgroundWork()
        job.join()
        assertThat(job.isCancelled).isTrue()
    }

    @Test
    fun `confirmer renvoie la transcription obtenue avec le rognage 0 et la durée finale`() = runTest {
        val c = controller(this, AudioTranscriber { _, _ -> heard("bonjour") })
        c.prepare()
        c.transcribe().join()
        val result = c.confirm(tempDir())
        assertThat(result.transcription).isEqualTo(me.meeshy.sdk.model.audioedit.AudioEditTranscription("fr", "bonjour"))
    }
}
