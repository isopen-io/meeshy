package me.meeshy.sdk.audioedit

import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.async
import kotlinx.coroutines.cancelAndJoin
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.runTest
import me.meeshy.sdk.model.audioedit.AudioEditError
import me.meeshy.sdk.model.audioedit.AudioEditOperation
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class AudioEditEngineTest {

    private fun engine(
        runner: AudioTransformRunner = FakeRunner(),
        status: AudioSourceStatus = AudioSourceStatus.READABLE,
    ) = AudioEditEngine(FakeProbe(status), runner, UnconfinedTestDispatcher())

    @Test
    fun `une opération produit un fichier m4a dans le dossier de l'appelant`() = runTest {
        val runner = FakeRunner()
        val dir = tempDir()
        val out = engine(runner).apply(AudioEditOperation.Trim(1.0, 4.0), sourceFile(), 10.0, dir)
        assertThat(out.parentFile).isEqualTo(dir)
        assertThat(out.extension).isEqualTo("m4a")
        assertThat(out.length()).isGreaterThan(0L)
        assertThat(runner.requests.single().plan.finalDuration).isWithin(1e-9).of(3.0)
    }

    @Test
    fun `la source n'est jamais modifiée`() = runTest {
        val source = sourceFile()
        val before = source.readBytes()
        engine().apply(AudioEditOperation.Gain(2.0), source, 10.0, tempDir())
        assertThat(source.readBytes()).isEqualTo(before)
    }

    @Test
    fun `une source absente ou illisible est typée`() = runTest {
        val dir = tempDir()
        val missing = runCatching {
            engine().apply(AudioEditOperation.Original, dir.resolve("nope.m4a"), 10.0, dir)
        }.exceptionOrNull()
        assertThat(missing).isEqualTo(AudioEditError.SourceUnreadable)
        val error = runCatching {
            engine(status = AudioSourceStatus.UNREADABLE).apply(AudioEditOperation.Original, sourceFile(), 10.0, dir)
        }.exceptionOrNull()
        assertThat(error).isEqualTo(AudioEditError.SourceUnreadable)
    }

    @Test
    fun `une source sans piste audio est typée`() = runTest {
        val error = runCatching {
            engine(status = AudioSourceStatus.NO_AUDIO_TRACK).apply(AudioEditOperation.Original, sourceFile(), 10.0, tempDir())
        }.exceptionOrNull()
        assertThat(error).isEqualTo(AudioEditError.NoAudioTrack)
    }

    @Test
    fun `un résultat trop court est refusé sans lancer le moteur`() = runTest {
        val runner = FakeRunner()
        val error = runCatching {
            engine(runner).apply(AudioEditOperation.Trim(2.0, 2.05), sourceFile(), 10.0, tempDir())
        }.exceptionOrNull()
        assertThat(error).isEqualTo(AudioEditError.ResultTooShort)
        assertThat(runner.requests).isEmpty()
    }

    @Test
    fun `une panne du moteur devient ExportFailed et ne laisse aucun fichier`() = runTest {
        val dir = tempDir()
        val error = runCatching {
            engine(FakeRunner(failure = IllegalStateException("boom"))).apply(AudioEditOperation.Gain(2.0), sourceFile(), 10.0, dir)
        }.exceptionOrNull()
        assertThat(error).isEqualTo(AudioEditError.ExportFailed("boom"))
        assertThat(dir.listFiles()?.filter { it.extension == "m4a" }).isEmpty()
    }

    @Test
    fun `une erreur typée du moteur traverse telle quelle`() = runTest {
        val error = runCatching {
            engine(FakeRunner(failure = AudioEditError.ExportUnavailable)).apply(AudioEditOperation.Gain(2.0), sourceFile(), 10.0, tempDir())
        }.exceptionOrNull()
        assertThat(error).isEqualTo(AudioEditError.ExportUnavailable)
    }

    @Test
    fun `un moteur qui n'écrit rien est un échec d'export`() = runTest {
        val error = runCatching {
            engine(FakeRunner(writesOutput = false)).apply(AudioEditOperation.Gain(2.0), sourceFile(), 10.0, tempDir())
        }.exceptionOrNull()
        assertThat(error).isInstanceOf(AudioEditError.ExportFailed::class.java)
    }

    @Test
    fun `annuler le rendu propage l'annulation et supprime le fichier partiel`() = runTest {
        val dir = tempDir()
        val gate = CompletableDeferred<Unit>()
        val job = async(UnconfinedTestDispatcher(testScheduler)) {
            engine(FakeRunner(gate = gate)).apply(AudioEditOperation.Gain(2.0), sourceFile(), 10.0, dir)
        }
        job.cancelAndJoin()
        assertThat(job.isCancelled).isTrue()
        assertThat(dir.listFiles()?.filter { it.extension == "m4a" }).isEmpty()
    }
}
