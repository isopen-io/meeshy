package me.meeshy.sdk.audio

import com.google.common.truth.Truth.assertThat
import java.io.File
import java.nio.file.Files
import java.util.concurrent.CountDownLatch
import java.util.concurrent.Executor
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit
import org.junit.Test

class ComposerVoiceCaptureTest {

    private class FakeEngine : VoiceRecorderEngine {
        var output: File? = null
        var started = 0
        var stopped = 0
        var released = 0
        var refusals = 0
        val startThreads = mutableListOf<Thread>()
        val stopThreads = mutableListOf<Thread>()

        override fun start(output: File) {
            startThreads += Thread.currentThread()
            if (refusals > 0) {
                refusals -= 1
                throw IllegalStateException("micro occupé")
            }
            started += 1
            this.output = output
            output.writeBytes(byteArrayOf(1, 2, 3))
        }

        override fun stop() {
            stopThreads += Thread.currentThread()
            stopped += 1
        }

        override fun release() {
            released += 1
        }

        override fun amplitude(): Int = 1_000
    }

    /** Un fil qui ne tourne que quand le test le décide : l'ordre des appels se lit, sans minuterie. */
    private class ManualExecutor : Executor {
        private val queue = ArrayDeque<Runnable>()
        val pending: Int get() = queue.size

        override fun execute(command: Runnable) {
            queue.addLast(command)
        }

        fun runAll() {
            while (queue.isNotEmpty()) queue.removeFirst().run()
        }
    }

    private class Rig(
        val capture: ComposerVoiceCapture,
        val engine: FakeEngine,
        val dir: File,
        val recorder: ManualExecutor?,
        val results: ManualExecutor?,
    ) {
        fun drain() {
            do {
                recorder?.runAll()
                results?.runAll()
            } while ((recorder?.pending ?: 0) + (results?.pending ?: 0) > 0)
        }
    }

    private fun rig(): Rig {
        val dir = Files.createTempDirectory("voice").toFile()
        val engine = FakeEngine()
        val capture = ComposerVoiceCapture(dir, { engine }, { 1_700_000_000_000L }, VoiceRecorderThreads.Inline)
        return Rig(capture, engine, dir, recorder = null, results = null)
    }

    private fun manualRig(): Rig {
        val dir = Files.createTempDirectory("voice").toFile()
        val engine = FakeEngine()
        val recorder = ManualExecutor()
        val results = ManualExecutor()
        val capture = ComposerVoiceCapture(dir, { engine }, { 1_700_000_000_000L }, VoiceRecorderThreads(recorder, results))
        return Rig(capture, engine, dir, recorder, results)
    }

    private fun Rig.started(): Boolean {
        var opened = false
        capture.start { opened = it }
        return opened
    }

    private fun Rig.abandoned(): VoiceTake? {
        var handed: VoiceTake? = null
        capture.abandon { handed = it }
        return handed
    }

    private fun Rig.finished(): VoiceTake? {
        var handed: VoiceTake? = null
        capture.finish { handed = it }
        return handed
    }

    @Test
    fun `leaving the screen during a long enough take frees the mic and hands the take over`() {
        val r = rig()
        r.started()
        r.capture.tick(2.0)

        val take = r.abandoned()

        assertThat(r.engine.stopped).isEqualTo(1)
        assertThat(r.engine.released).isEqualTo(1)
        assertThat(take?.file).isEqualTo(r.engine.output)
        assertThat(take?.file?.exists()).isTrue()
        assertThat(r.capture.session.isRecording).isFalse()
    }

    @Test
    fun `leaving the screen during a too short take frees the mic and deletes the file`() {
        val r = rig()
        r.started()
        r.capture.tick(0.2)

        val take = r.abandoned()

        assertThat(take).isNull()
        assertThat(r.engine.released).isEqualTo(1)
        assertThat(r.engine.output?.exists()).isFalse()
    }

    @Test
    fun `leaving the screen with no take running touches nothing`() {
        val r = rig()
        var answered = false
        var handed: VoiceTake? = null

        r.capture.abandon {
            answered = true
            handed = it
        }

        assertThat(answered).isTrue()
        assertThat(handed).isNull()
        assertThat(r.engine.released).isEqualTo(0)
    }

    @Test
    fun `cancelling frees the mic and deletes the take`() {
        val r = rig()
        r.started()
        r.capture.tick(3.0)

        r.capture.cancel()

        assertThat(r.engine.released).isEqualTo(1)
        assertThat(r.engine.output?.exists()).isFalse()
        assertThat(r.capture.session.isRecording).isFalse()
    }

    @Test
    fun `a mic that refuses to start leaves no file and no running take`() {
        val r = rig()
        r.engine.refusals = 1

        assertThat(r.started()).isFalse()

        assertThat(r.engine.released).isEqualTo(1)
        assertThat(r.dir.listFiles().orEmpty()).isEmpty()
        assertThat(r.capture.session.isRecording).isFalse()
    }

    @Test
    fun `finishing a take hands over its file and its duration`() {
        val r = rig()
        r.started()
        r.capture.tick(1.5)

        val take = r.finished()

        assertThat(take?.durationSeconds).isWithin(0.001).of(1.5)
        assertThat(take?.file?.exists()).isTrue()
        assertThat(r.engine.released).isEqualTo(1)
    }

    @Test
    fun `finishing a capture that never started hands nothing over`() {
        val r = rig()

        assertThat(r.finished()).isNull()
        assertThat(r.engine.released).isEqualTo(0)
    }

    @Test
    fun `a started take reports that the mic is open`() {
        val r = rig()

        assertThat(r.started()).isTrue()
        assertThat(r.capture.session.isRecording).isTrue()
    }

    @Test
    fun `a second start while a take runs is refused and the running take is untouched`() {
        val r = rig()
        r.started()

        assertThat(r.started()).isFalse()
        assertThat(r.engine.started).isEqualTo(1)
        assertThat(r.capture.session.isRecording).isTrue()
    }

    @Test
    fun `the pill is live the instant the mic is pressed, before the recorder has opened`() {
        val r = manualRig()

        r.capture.start()

        assertThat(r.capture.session.isRecording).isTrue()
        assertThat(r.engine.started).isEqualTo(0)
        assertThat(r.recorder?.pending).isEqualTo(1)
    }

    @Test
    fun `the pill is gone the instant the mic is released, before the recorder has closed`() {
        val r = manualRig()
        r.capture.start()
        r.drain()
        r.capture.tick(2.0)

        r.capture.finish()

        assertThat(r.capture.session.isRecording).isFalse()
        assertThat(r.engine.stopped).isEqualTo(0)
    }

    @Test
    fun `a release right after the press closes the recorder only after it opened`() {
        val r = manualRig()
        val order = mutableListOf<String>()
        r.capture.start { order += "started:$it" }
        r.capture.finish { order += "take:${it != null}" }

        r.drain()

        assertThat(r.engine.started).isEqualTo(1)
        assertThat(r.engine.stopped).isEqualTo(1)
        assertThat(r.engine.released).isEqualTo(1)
        assertThat(order).containsExactly("started:false", "take:false").inOrder()
        assertThat(r.engine.output?.exists()).isFalse()
    }

    @Test
    fun `a mic that refuses after the pill went live takes the pill down`() {
        val r = manualRig()
        r.engine.refusals = 1
        var opened: Boolean? = null
        r.capture.start { opened = it }
        assertThat(r.capture.session.isRecording).isTrue()

        r.drain()

        assertThat(opened).isFalse()
        assertThat(r.capture.session.isRecording).isFalse()
        assertThat(r.dir.listFiles().orEmpty()).isEmpty()
    }

    @Test
    fun `a refusal that arrives after the release does not disturb the next take`() {
        val r = manualRig()
        r.engine.refusals = 1
        r.capture.start()
        r.capture.finish()
        r.capture.start()

        r.drain()

        assertThat(r.capture.session.isRecording).isTrue()
        assertThat(r.engine.started).isEqualTo(1)
    }

    @Test
    fun `a cancelled take frees the mic once the recorder runs and deletes the file`() {
        val r = manualRig()
        r.capture.start()
        r.capture.cancel()

        r.drain()

        assertThat(r.capture.session.isRecording).isFalse()
        assertThat(r.engine.released).isEqualTo(1)
        assertThat(r.engine.output?.exists()).isFalse()
    }

    @Test
    fun `the microphone is opened and closed on the recorder thread, never on the caller's`() {
        val dir = Files.createTempDirectory("voice").toFile()
        val engine = FakeEngine()
        val recorder = Executors.newSingleThreadExecutor { Thread(it, "test-recorder") }
        val closed = CountDownLatch(1)
        val capture = ComposerVoiceCapture(dir, { engine }, { 1_700_000_000_000L }, VoiceRecorderThreads(recorder, Executor { it.run() }))
        try {
            capture.start()
            capture.tick(2.0)
            capture.finish { closed.countDown() }

            assertThat(closed.await(5, TimeUnit.SECONDS)).isTrue()
            assertThat(engine.startThreads.map { it.name }).containsExactly("test-recorder")
            assertThat(engine.stopThreads.map { it.name }).containsExactly("test-recorder")
            assertThat(engine.startThreads).doesNotContain(Thread.currentThread())
        } finally {
            recorder.shutdownNow()
        }
    }
}
