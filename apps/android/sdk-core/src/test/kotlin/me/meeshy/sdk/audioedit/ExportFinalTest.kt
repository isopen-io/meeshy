package me.meeshy.sdk.audioedit

import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.runTest
import me.meeshy.sdk.model.audioedit.AudioEditorMode
import me.meeshy.sdk.model.audioedit.AudioEditorTool
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class ExportFinalTest {

    private val dispatcher = UnconfinedTestDispatcher()

    @Test
    fun `le rognage cuit rend trimStart 0 et trimEnd la durée finale, sans transcription`() = runTest {
        val c = AudioEditorController(
            source = sourceFile(),
            root = tempDir(),
            engine = AudioEditEngine(FakeProbe(), FakeRunner(), dispatcher),
            durations = AudioDurationReader { 10.0 },
            ioDispatcher = dispatcher,
            scope = backgroundScope,
        )
        c.prepare()
        c.setMode(AudioEditorMode.SIMPLE)
        c.selectTool(AudioEditorTool.TRIM)
        c.update { it.copy(trimStart = 2.0, trimEnd = 6.0) }
        c.apply().join()
        val result = c.confirm(tempDir())
        assertThat(result.trimStartSeconds).isEqualTo(0.0)
        assertThat(result.trimEndSeconds).isEqualTo(result.durationSeconds)
        assertThat(result.transcription).isNull()
        assertThat(result.file.exists()).isTrue()
    }
}
