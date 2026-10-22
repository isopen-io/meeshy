package me.meeshy.sdk.media

import com.google.common.truth.Truth.assertThat
import java.io.File
import kotlin.io.path.createTempDirectory
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.async
import kotlinx.coroutines.cancelAndJoin
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.runTest
import me.meeshy.sdk.model.media.ImageUploadContext
import me.meeshy.sdk.model.media.VideoSourceCodec
import me.meeshy.sdk.model.media.VideoSourceInfo
import me.meeshy.sdk.model.media.VideoTargetCodec
import me.meeshy.sdk.model.media.VideoTranscodePlan
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class VideoTranscoderDecisionTest {

    private class FakeRunner(
        private val failOn: (VideoTranscodePlan) -> Boolean = { false },
        private val gate: CompletableDeferred<Unit>? = null,
    ) : VideoTransformRunner {
        val plans = mutableListOf<VideoTranscodePlan>()
        val outputs = mutableListOf<File>()

        override suspend fun run(request: VideoTransformRequest, onProgress: (Float) -> Unit) {
            plans += request.plan
            outputs += request.output
            request.output.writeBytes(ByteArray(16) { 1 })
            onProgress(0.5f)
            gate?.await()
            if (failOn(request.plan)) error("export failed")
        }
    }

    private val sourceFile = File.createTempFile("source", ".mp4")

    private fun transcoder(
        info: VideoSourceInfo?,
        hevc: Boolean,
        runner: VideoTransformRunner,
        dir: File = createTempDirectory().toFile(),
    ) = VideoTranscoder(
        probe = object : VideoSourceProbe {
            override fun probe(file: File) = info
        },
        capabilities = object : VideoCodecCapabilities {
            override fun hasHardwareHevc() = hevc
        },
        runner = runner,
        workDirectory = dir,
        ioDispatcher = UnconfinedTestDispatcher(),
    )

    private fun heavy() = VideoSourceInfo(VideoSourceCodec.HEVC, 2160, 3840, 40_000_000, 60f)
    private fun light() = VideoSourceInfo(VideoSourceCodec.H264, 720, 1280, 2_000_000, 30f)

    @Test
    fun `une vidéo légère est remuxée sans ré encodage`() = runTest {
        val runner = FakeRunner()
        val outcome = transcoder(light(), hevc = true, runner = runner).compress(sourceFile, ImageUploadContext.MESSAGE)
        assertThat(outcome).isInstanceOf(VideoCompressionOutcome.Compressed::class.java)
        assertThat((outcome as VideoCompressionOutcome.Compressed).mode).isEqualTo(VideoCompressionMode.REMUXED)
        assertThat(runner.plans).containsExactly(VideoTranscodePlan.Passthrough)
    }

    @Test
    fun `une vidéo lourde est ré encodée en hevc avec un décodeur matériel`() = runTest {
        val runner = FakeRunner()
        val outcome = transcoder(heavy(), hevc = true, runner = runner).compress(sourceFile, ImageUploadContext.MESSAGE)
        assertThat((outcome as VideoCompressionOutcome.Compressed).mode).isEqualTo(VideoCompressionMode.REENCODED_HEVC)
        assertThat((runner.plans.single() as VideoTranscodePlan.Transcode).codec).isEqualTo(VideoTargetCodec.HEVC)
    }

    @Test
    fun `sans décodeur matériel le ré encodage est en h264`() = runTest {
        val runner = FakeRunner()
        val outcome = transcoder(heavy(), hevc = false, runner = runner).compress(sourceFile, ImageUploadContext.MESSAGE)
        assertThat((outcome as VideoCompressionOutcome.Compressed).mode).isEqualTo(VideoCompressionMode.REENCODED_H264)
    }

    @Test
    fun `la progression est publiée`() = runTest {
        val seen = mutableListOf<Float>()
        transcoder(heavy(), hevc = true, runner = FakeRunner()).compress(sourceFile, ImageUploadContext.MESSAGE) { seen += it }
        assertThat(seen).contains(0.5f)
    }

    @Test
    fun `un échec hevc retombe sur h264 sans plantage`() = runTest {
        val runner = FakeRunner(failOn = { it is VideoTranscodePlan.Transcode && it.codec == VideoTargetCodec.HEVC })
        val outcome = transcoder(heavy(), hevc = true, runner = runner).compress(sourceFile, ImageUploadContext.MESSAGE)
        assertThat((outcome as VideoCompressionOutcome.Compressed).mode).isEqualTo(VideoCompressionMode.REENCODED_H264)
        assertThat(runner.outputs.first().exists()).isFalse()
    }

    @Test
    fun `un remux raté tente le ré encodage`() = runTest {
        val runner = FakeRunner(failOn = { it is VideoTranscodePlan.Passthrough })
        val outcome = transcoder(light(), hevc = false, runner = runner).compress(sourceFile, ImageUploadContext.MESSAGE)
        assertThat((outcome as VideoCompressionOutcome.Compressed).mode).isEqualTo(VideoCompressionMode.REENCODED_H264)
    }

    @Test
    fun `un échec total rend l'original avec un état explicite et nettoie`() = runTest {
        val runner = FakeRunner(failOn = { true })
        val outcome = transcoder(heavy(), hevc = true, runner = runner).compress(sourceFile, ImageUploadContext.MESSAGE)
        assertThat(outcome).isEqualTo(
            VideoCompressionOutcome.Original(sourceFile, VideoCompressionFailure.TRANSFORM_FAILED),
        )
        assertThat(runner.outputs.none { it.exists() }).isTrue()
    }

    @Test
    fun `une source illisible rend l'original`() = runTest {
        val outcome = transcoder(null, hevc = true, runner = FakeRunner()).compress(sourceFile, ImageUploadContext.MESSAGE)
        assertThat(outcome).isEqualTo(
            VideoCompressionOutcome.Original(sourceFile, VideoCompressionFailure.UNREADABLE_SOURCE),
        )
    }

    @Test
    fun `l'annulation supprime le fichier temporaire`() = runTest(StandardTestDispatcher()) {
        val runner = FakeRunner(gate = CompletableDeferred())
        val job = async(UnconfinedTestDispatcher(testScheduler)) {
            transcoder(heavy(), hevc = true, runner = runner).compress(sourceFile, ImageUploadContext.MESSAGE)
        }
        testScheduler.runCurrent()
        assertThat(runner.outputs.single().exists()).isTrue()
        job.cancelAndJoin()
        assertThat(runner.outputs.single().exists()).isFalse()
    }
}
