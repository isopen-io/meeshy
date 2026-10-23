package me.meeshy.app.chat

import com.google.common.truth.Truth.assertThat
import java.io.File
import java.nio.file.Files
import org.junit.Test

class ComposerVoiceCaptureTest {

    private class FakeEngine : VoiceRecorderEngine {
        var output: File? = null
        var stopped = 0
        var released = 0
        var failOnStart = false

        override fun start(output: File) {
            if (failOnStart) throw IllegalStateException("micro occupé")
            this.output = output
            output.writeBytes(byteArrayOf(1, 2, 3))
        }

        override fun stop() {
            stopped += 1
        }

        override fun release() {
            released += 1
        }

        override fun amplitude(): Int = 1_000
    }

    private class Rig(val capture: ComposerVoiceCapture, val engine: FakeEngine, val dir: File)

    private fun rig(): Rig {
        val dir = Files.createTempDirectory("voice").toFile()
        val engine = FakeEngine()
        return Rig(ComposerVoiceCapture(dir, { engine }, { 1_700_000_000_000L }), engine, dir)
    }

    @Test
    fun `leaving the screen during a long enough take frees the mic and hands the take over`() {
        val r = rig()
        r.capture.start()
        r.capture.tick(2.0)

        val take = r.capture.abandon()

        assertThat(r.engine.stopped).isEqualTo(1)
        assertThat(r.engine.released).isEqualTo(1)
        assertThat(take?.file).isEqualTo(r.engine.output)
        assertThat(take?.file?.exists()).isTrue()
        assertThat(r.capture.session.isRecording).isFalse()
    }

    @Test
    fun `leaving the screen during a too short take frees the mic and deletes the file`() {
        val r = rig()
        r.capture.start()
        r.capture.tick(0.2)

        val take = r.capture.abandon()

        assertThat(take).isNull()
        assertThat(r.engine.released).isEqualTo(1)
        assertThat(r.engine.output?.exists()).isFalse()
    }

    @Test
    fun `leaving the screen with no take running touches nothing`() {
        val r = rig()

        assertThat(r.capture.abandon()).isNull()
        assertThat(r.engine.released).isEqualTo(0)
    }

    @Test
    fun `cancelling frees the mic and deletes the take`() {
        val r = rig()
        r.capture.start()
        r.capture.tick(3.0)

        r.capture.cancel()

        assertThat(r.engine.released).isEqualTo(1)
        assertThat(r.engine.output?.exists()).isFalse()
        assertThat(r.capture.session.isRecording).isFalse()
    }

    @Test
    fun `a mic that refuses to start leaves no file and no running take`() {
        val r = rig()
        r.engine.failOnStart = true

        assertThat(r.capture.start()).isFalse()

        assertThat(r.engine.released).isEqualTo(1)
        assertThat(r.dir.listFiles().orEmpty()).isEmpty()
        assertThat(r.capture.session.isRecording).isFalse()
    }

    @Test
    fun `finishing a take hands over its file and its duration`() {
        val r = rig()
        r.capture.start()
        r.capture.tick(1.5)

        val take = r.capture.finish()

        assertThat(take?.durationSeconds).isWithin(0.001).of(1.5)
        assertThat(take?.file?.exists()).isTrue()
        assertThat(r.engine.released).isEqualTo(1)
    }
}
