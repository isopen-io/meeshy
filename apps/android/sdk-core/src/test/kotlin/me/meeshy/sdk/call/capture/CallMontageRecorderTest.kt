package me.meeshy.sdk.call.capture

import android.graphics.Bitmap
import com.google.common.truth.Truth.assertThat
import io.mockk.mockk
import java.io.File
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.runTest
import me.meeshy.sdk.media.CaptureGallery
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder

/** Le film : images et son sur une même horloge, un fichier valide à l'arrêt, rien qui traîne après un échec. */
@OptIn(ExperimentalCoroutinesApi::class)
class CallMontageRecorderTest {

    @get:Rule val folder = TemporaryFolder()

    private class Clock {
        var nanos = 0L
        val clock = CallMontageClock(monotonicNanos = { nanos }, wallMillis = { 42L })
    }

    private class FakeVideo(private val clock: Clock, private val opens: Boolean = true) : CallMontageVideoEncoder {
        var frames = 0
        var released = false
        private var announced = false
        private var pending = 0

        override fun open(width: Int, height: Int) = opens
        override fun draw(frame: Bitmap) {
            frames += 1
            pending += 1
        }

        override fun drain(sink: CallMontageEncodedSink) {
            if (!announced) sink.format(CallMontageTrack.VIDEO, "avc").also { announced = true }
            repeat(pending) { sink.sample(CallMontageTrack.VIDEO, ByteArray(4), clock.nanos / 1_000, 1) }
            pending = 0
        }

        override fun finish(sink: CallMontageEncodedSink) = drain(sink)
        override fun release() {
            released = true
        }
    }

    private class FakeAudio : CallMontageAudioEncoder {
        private var announced = false
        private val queue = mutableListOf<Long>()

        override fun open(format: CallMontageAudioFormat) = true
        override fun encode(pcm: ByteArray, ptsUs: Long) {
            queue += ptsUs
        }

        override fun drain(sink: CallMontageEncodedSink) {
            if (!announced) sink.format(CallMontageTrack.AUDIO, "aac").also { announced = true }
            queue.forEach { sink.sample(CallMontageTrack.AUDIO, ByteArray(4), it, 0) }
            queue.clear()
        }

        override fun finish(sink: CallMontageEncodedSink) = drain(sink)
        override fun release() = Unit
    }

    private class FakeSource(val available: Boolean = true) : CallMontageAudioSource {
        var onChunk: ((CallMontageAudioChunk) -> Unit)? = null
        var stopped = false
        override val format = CallMontageAudioFormat(44_100, 1)
        override fun start(onChunk: (CallMontageAudioChunk) -> Unit): Boolean {
            this.onChunk = onChunk
            return available
        }

        override fun stop() {
            stopped = true
        }

        fun hear(startUs: Long) = onChunk?.invoke(CallMontageAudioChunk(ByteArray(8), format, startUs))
    }

    private class FakeContainer(val file: File) : CallMontageContainer {
        val formats = mutableListOf<Any>()
        val writes = mutableListOf<Pair<Int, Long>>()
        var started = false
        var stopped = false
        init {
            file.writeText("mp4")
        }

        override fun addTrack(format: Any): Int {
            check(!started)
            formats += format
            return formats.lastIndex
        }

        override fun start() {
            started = true
        }

        override fun write(track: Int, data: ByteArray, ptsUs: Long, flags: Int) {
            check(started)
            writes += track to ptsUs
        }

        override fun stop() {
            stopped = true
        }

        override fun release() = Unit
    }

    private class Rig(
        val time: Clock,
        val video: FakeVideo,
        val source: FakeSource?,
        val recorder: CallMontageRecorder,
        val container: () -> FakeContainer,
    )

    private fun rig(source: FakeSource? = FakeSource(), videoOpens: Boolean = true): Rig {
        val time = Clock()
        val video = FakeVideo(time, videoOpens)
        var made: FakeContainer? = null
        val recorder = CallMontageRecorder(
            videoEncoder = video,
            audioEncoder = FakeAudio(),
            audioSource = source,
            containers = { FakeContainer(it).also { c -> made = c } },
            directory = folder.root,
            clock = time.clock,
            dispatcher = UnconfinedTestDispatcher(),
        )
        return Rig(time, video, source, recorder) { checkNotNull(made) }
    }

    private val bitmap: Bitmap = mockk(relaxed = true)

    @Test
    fun `un film porte les images et le son sur la meme horloge`() = runTest {
        val rig = rig()
        assertThat(rig.recorder.start(720, 1280)).isTrue()
        assertThat(rig.recorder.startedAtMillis.value).isEqualTo(42L)

        rig.time.nanos = 1_000_000_000L
        rig.recorder.append(bitmap)
        rig.source!!.hear(startUs = 1_020_000L)
        rig.time.nanos = 1_066_000_000L
        rig.recorder.append(bitmap)
        val film = rig.recorder.finish()

        val container = rig.container()
        assertThat(film).isNotNull()
        assertThat(film!!.exists()).isTrue()
        assertThat(container.formats).containsExactly("avc", "aac").inOrder()
        assertThat(container.writes.filter { it.first == 0 }.map { it.second }).containsExactly(1_000_000L, 1_066_000L).inOrder()
        assertThat(container.writes.filter { it.first == 1 }.map { it.second }).containsExactly(1_020_000L)
        assertThat(container.stopped).isTrue()
        assertThat(rig.source.stopped).isTrue()
        assertThat(rig.recorder.startedAtMillis.value).isNull()
    }

    @Test
    fun `le son d'avant la premiere image est ecarte`() = runTest {
        val rig = rig()
        rig.recorder.start(720, 1280)
        rig.source!!.hear(startUs = 500_000L)
        rig.time.nanos = 1_000_000_000L
        rig.recorder.append(bitmap)
        rig.recorder.finish()

        assertThat(rig.container().writes.filter { it.first == 1 }).isEmpty()
    }

    @Test
    fun `sans micro le film part muet`() = runTest {
        val rig = rig(source = FakeSource(available = false))
        rig.recorder.start(720, 1280)
        rig.time.nanos = 1_000_000_000L
        rig.recorder.append(bitmap)
        val film = rig.recorder.finish()

        assertThat(film).isNotNull()
        assertThat(rig.container().formats).containsExactly("avc")
    }

    @Test
    fun `une voix qui tarde plus d'une seconde ne retient pas le film`() = runTest {
        val rig = rig()
        rig.recorder.start(720, 1280)
        rig.time.nanos = 1_000_000_000L
        rig.recorder.append(bitmap)
        assertThat(rig.container().started).isFalse()
        rig.time.nanos = 2_100_000_000L
        rig.recorder.append(bitmap)

        assertThat(rig.container().started).isTrue()
        assertThat(rig.container().formats).containsExactly("avc")
    }

    @Test
    fun `un film sans image n'est pas un fichier et le temporaire est supprime`() = runTest {
        val rig = rig()
        rig.recorder.start(720, 1280)
        val film = rig.recorder.finish()

        assertThat(film).isNull()
        assertThat(folder.root.listFiles()).isEmpty()
    }

    @Test
    fun `annuler supprime le temporaire`() = runTest {
        val rig = rig()
        rig.recorder.start(720, 1280)
        rig.recorder.cancel()

        assertThat(folder.root.listFiles()).isEmpty()
        assertThat(rig.video.released).isTrue()
        assertThat(rig.recorder.startedAtMillis.value).isNull()
    }

    @Test
    fun `un encodeur qui refuse ne demarre rien`() = runTest {
        val rig = rig(videoOpens = false)
        assertThat(rig.recorder.start(720, 1280)).isFalse()
        assertThat(rig.recorder.startedAtMillis.value).isNull()
    }

    private class Gallery(private val accepts: Boolean) : CaptureGallery {
        var saved: File? = null
        override suspend fun saveImage(jpeg: ByteArray, displayName: String) = true
        override suspend fun saveVideo(file: File, displayName: String): Boolean {
            saved = file
            return accepts
        }
    }

    private suspend fun filmed(rig: Rig) {
        rig.recorder.start(720, 1280)
        rig.time.nanos = 1_000_000_000L
        rig.recorder.append(bitmap)
    }

    @Test
    fun `le film fini est depose en galerie puis le temporaire est supprime`() = runTest {
        val rig = rig(source = null)
        filmed(rig)
        val gallery = Gallery(accepts = true)

        assertThat(rig.recorder.finishInto(gallery, "montage")).isEqualTo(CallMontageFilmOutcome.SAVED)
        assertThat(gallery.saved).isNotNull()
        assertThat(folder.root.listFiles()).isEmpty()
    }

    @Test
    fun `un depot refuse est un echec et le temporaire est supprime`() = runTest {
        val rig = rig(source = null)
        filmed(rig)

        assertThat(rig.recorder.finishInto(Gallery(accepts = false), "montage")).isEqualTo(CallMontageFilmOutcome.FAILED)
        assertThat(folder.root.listFiles()).isEmpty()
    }

    @Test
    fun `un film sans image est un echec sans depot`() = runTest {
        val rig = rig(source = null)
        rig.recorder.start(720, 1280)
        val gallery = Gallery(accepts = true)

        assertThat(rig.recorder.finishInto(gallery, "montage")).isEqualTo(CallMontageFilmOutcome.FAILED)
        assertThat(gallery.saved).isNull()
    }
}
