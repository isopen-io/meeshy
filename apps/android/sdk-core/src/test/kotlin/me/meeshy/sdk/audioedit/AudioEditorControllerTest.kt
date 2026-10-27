package me.meeshy.sdk.audioedit

import com.google.common.truth.Truth.assertThat
import java.io.File
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.runTest
import me.meeshy.sdk.model.audioedit.AudioEditError
import me.meeshy.sdk.model.audioedit.AudioEditOperation
import me.meeshy.sdk.model.audioedit.AudioEditorMode
import me.meeshy.sdk.model.audioedit.AudioEditorTool
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class AudioEditorControllerTest {

    private val dispatcher = UnconfinedTestDispatcher()

    private fun controller(
        scope: TestScope,
        runner: FakeRunner = FakeRunner(),
        probe: AudioSourceProbe = FakeProbe(),
        source: File = sourceFile(),
        root: File = tempDir(),
    ) = AudioEditorController(
        source = source,
        root = root,
        engine = AudioEditEngine(probe, runner, dispatcher),
        durations = AudioDurationReader { 10.0 },
        ioDispatcher = dispatcher,
        scope = scope.backgroundScope,
    )

    @Test
    fun `avant la préparation l'éditeur attend, après elle la durée est connue`() = runTest {
        val c = controller(this)
        assertThat(c.state.value.preparing).isTrue()
        c.prepare()
        assertThat(c.state.value.preparing).isFalse()
        assertThat(c.state.value.duration).isEqualTo(10.0)
        assertThat(c.state.value.staging.trimEnd).isEqualTo(10.0)
    }

    @Test
    fun `préparer deux fois ne réinitialise pas les réglages armés`() = runTest {
        val c = controller(this)
        c.prepare()
        c.selectTool(AudioEditorTool.FADE)
        c.update { it.copy(fadeIn = true) }
        c.prepare()
        assertThat(c.state.value.staging.fadeIn).isTrue()
    }

    @Test
    fun `une source illisible laisse l'éditeur prêt à se fermer avec l'erreur typée`() = runTest {
        val c = controller(this, probe = FakeProbe(AudioSourceStatus.UNREADABLE), source = File("/nope/x.m4a"))
        c.prepare()
        assertThat(c.state.value.preparing).isFalse()
        assertThat(c.state.value.document).isNull()
        assertThat(c.state.value.error).isEqualTo(AudioEditError.SourceUnreadable)
    }

    @Test
    fun `appliquer cuit une version, ferme l'outil et remet les réglages à neuf`() = runTest {
        val c = controller(this)
        c.prepare()
        c.setMode(AudioEditorMode.PRO)
        c.selectTool(AudioEditorTool.VOLUME)
        c.update { it.copy(gain = 2.0) }
        assertThat(c.state.value.canApply).isTrue()
        c.apply().join()
        val state = c.state.value
        assertThat(state.document!!.versions).hasSize(2)
        assertThat(state.document!!.active.operation).isEqualTo(AudioEditOperation.Gain(2.0))
        assertThat(state.staging.tool).isNull()
        assertThat(state.staging.gain).isEqualTo(1.0)
        assertThat(state.processing).isFalse()
    }

    @Test
    fun `pendant un traitement on ne peut ni appliquer, ni annuler`() = runTest {
        val gate = CompletableDeferred<Unit>()
        val c = controller(this, runner = FakeRunner(gate = gate))
        c.prepare()
        c.setMode(AudioEditorMode.PRO)
        c.selectTool(AudioEditorTool.FADE)
        c.update { it.copy(fadeOut = true) }
        val job = c.apply()
        assertThat(c.state.value.processing).isTrue()
        assertThat(c.state.value.canApply).isFalse()
        assertThat(c.state.value.canUndo).isFalse()
        gate.complete(Unit)
        job.join()
        assertThat(c.state.value.canUndo).isTrue()
    }

    @Test
    fun `un échec d'export garde le document et expose l'erreur, la sélection d'un outil l'efface`() = runTest {
        val c = controller(this, runner = FakeRunner(failure = IllegalStateException("boom")))
        c.prepare()
        c.setMode(AudioEditorMode.PRO)
        c.selectTool(AudioEditorTool.SPEED)
        c.update { it.copy(speed = 1.5) }
        c.apply().join()
        assertThat(c.state.value.error).isInstanceOf(AudioEditError.ExportFailed::class.java)
        assertThat(c.state.value.document!!.versions).hasSize(1)
        c.selectTool(AudioEditorTool.TRIM)
        assertThat(c.state.value.error).isNull()
    }

    @Test
    fun `annuler puis rétablir déplace le curseur et réarme les réglages sur la durée active`() = runTest {
        val c = controller(this)
        c.prepare()
        c.setMode(AudioEditorMode.PRO)
        c.selectTool(AudioEditorTool.VOLUME)
        c.update { it.copy(gain = 2.0) }
        c.apply().join()
        c.undo().join()
        assertThat(c.state.value.canUndo).isFalse()
        assertThat(c.state.value.canRedo).isTrue()
        c.redo().join()
        assertThat(c.state.value.document!!.active.operation).isEqualTo(AudioEditOperation.Gain(2.0))
    }

    @Test
    fun `confirmer rend le fichier hors de la session et efface la session`() = runTest {
        val c = controller(this)
        c.prepare()
        val sessionDir = c.sessionDirectory!!
        val out = tempDir()
        val result = c.confirm(out)
        assertThat(result.file.parentFile).isEqualTo(out)
        assertThat(result.trimStartSeconds).isEqualTo(0.0)
        assertThat(sessionDir.exists()).isFalse()
    }

    @Test
    fun `abandonner efface la session`() = runTest {
        val c = controller(this)
        c.prepare()
        val sessionDir = c.sessionDirectory!!
        c.discard()
        assertThat(sessionDir.exists()).isFalse()
    }
}
