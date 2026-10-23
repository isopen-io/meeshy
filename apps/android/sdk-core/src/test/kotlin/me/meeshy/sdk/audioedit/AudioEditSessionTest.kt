package me.meeshy.sdk.audioedit

import com.google.common.truth.Truth.assertThat
import java.io.File
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.runTest
import me.meeshy.sdk.model.audioedit.AudioEditDocument
import me.meeshy.sdk.model.audioedit.AudioEditOperation
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class AudioEditSessionTest {

    private val dispatcher = UnconfinedTestDispatcher()

    private suspend fun open(root: File = tempDir(), source: File = sourceFile()): AudioEditSession =
        AudioEditSession.open(
            source = source,
            root = root,
            engine = AudioEditEngine(FakeProbe(), FakeRunner(), dispatcher),
            durations = AudioDurationReader { 10.0 },
            ioDispatcher = dispatcher,
        )

    @Test
    fun `ouvrir copie la source dans la session sans toucher l'original`() = runTest {
        val source = sourceFile()
        val session = open(source = source)
        assertThat(session.activeFile.readBytes()).isEqualTo(source.readBytes())
        assertThat(session.activeFile).isNotEqualTo(source)
        assertThat(session.document.value.active.durationSeconds).isEqualTo(10.0)
    }

    @Test
    fun `appliquer puis annuler puis refaire déplace le curseur et persiste le manifeste`() = runTest {
        val session = open()
        session.apply(AudioEditOperation.Gain(2.0))
        assertThat(session.document.value.canUndo).isTrue()
        session.undo()
        assertThat(session.document.value.isModified).isFalse()
        session.redo()
        assertThat(session.document.value.isModified).isTrue()
        val manifest = File(session.sessionDirectory, "manifest.json").readText()
        assertThat(AudioEditDocument.fromManifestJson(manifest)).isEqualTo(session.document.value)
    }

    @Test
    fun `une opération identité ne crée aucune version`() = runTest {
        val session = open()
        session.apply(AudioEditOperation.Speed(1.0))
        assertThat(session.document.value.hasHistory).isFalse()
    }

    @Test
    fun `éditer après un undo supprime les fichiers de la branche abandonnée`() = runTest {
        val session = open()
        session.apply(AudioEditOperation.Gain(2.0))
        val abandoned = File(session.sessionDirectory, session.document.value.active.fileName)
        session.undo()
        session.apply(AudioEditOperation.Gain(3.0))
        assertThat(abandoned.exists()).isFalse()
    }

    @Test
    fun `confirmer copie l'audio actif, rend trimStart 0 et trimEnd la durée, et nettoie la session`() = runTest {
        val session = open()
        session.apply(AudioEditOperation.Gain(2.0))
        val out = tempDir()
        val result = session.confirm(out)
        assertThat(result.file.parentFile).isEqualTo(out)
        assertThat(result.file.exists()).isTrue()
        assertThat(result.trimStartSeconds).isEqualTo(0.0)
        assertThat(result.trimEndSeconds).isEqualTo(result.durationSeconds)
        assertThat(session.sessionDirectory.exists()).isFalse()
    }

    @Test
    fun `abandonner efface la session`() = runTest {
        val session = open()
        session.discard()
        assertThat(session.sessionDirectory.exists()).isFalse()
    }

    @Test
    fun `les sessions abandonnées depuis plus de 24 h sont purgées`() = runTest {
        val root = tempDir()
        val stale = File(root, "old").apply { mkdirs(); setLastModified(0L) }
        val fresh = File(root, "fresh").apply { mkdirs() }
        open(root = root)
        assertThat(stale.exists()).isFalse()
        assertThat(fresh.exists()).isTrue()
    }
}
