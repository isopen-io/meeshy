package me.meeshy.app.chat

import android.media.MediaFormat
import android.os.Looper
import androidx.test.core.app.ApplicationProvider
import com.google.common.collect.Range
import com.google.common.truth.Truth.assertThat
import java.io.File
import java.time.Duration
import org.junit.After
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.Shadows.shadowOf
import org.robolectric.annotation.Config
import org.robolectric.shadows.MediaCodecInfoBuilder
import org.robolectric.shadows.ShadowMediaCodec
import org.robolectric.shadows.ShadowMediaCodecList

/**
 * Le moteur RÉEL des vocaux du fil, sous Android 9 comme le S8 (#13674). Une piste traduite est en
 * Ogg Opus, un original en AAC/M4A. Le décodeur Opus existe depuis Android 5 : ce qui manquait sous
 * Android 10 était l'EXTRACTEUR Ogg du lecteur natif, et le vocal défilait en silence. Les décodeurs
 * de la plateforme sont déclarés ici tels que le S8 les porte (`OMX.google.opus.decoder`,
 * `OMX.google.aac.decoder`) ; l'extraction, elle, est celle du moteur.
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [28])
class ExoVoiceNoteEngineTest {

    private class Outcome {
        var prepared = false
        var failed = false
        val settled: Boolean get() = prepared || failed
    }

    private class Loaded(val engine: ExoVoiceNoteEngine, val outcome: Outcome)

    private val engines = mutableListOf<ExoVoiceNoteEngine>()

    @After
    fun tearDown() {
        engines.forEach(ExoVoiceNoteEngine::release)
        ShadowMediaCodecList.reset()
        ShadowMediaCodec.clearCodecs()
    }

    private fun platformDecoders() {
        decoder("OMX.google.opus.decoder", MediaFormat.MIMETYPE_AUDIO_OPUS)
        decoder("OMX.google.aac.decoder", MediaFormat.MIMETYPE_AUDIO_AAC)
    }

    private fun decoder(name: String, mime: String) {
        val format = MediaFormat().apply { setString(MediaFormat.KEY_MIME, mime) }
        ShadowMediaCodecList.addCodec(
            MediaCodecInfoBuilder.newBuilder()
                .setName(name)
                .setIsEncoder(false)
                .setCapabilities(
                    MediaCodecInfoBuilder.CodecCapabilitiesBuilder.newBuilder()
                        .setMediaFormat(format)
                        .setIsEncoder(false)
                        .build(),
                )
                .build(),
        )
        ShadowMediaCodec.addDecoder(
            name,
            ShadowMediaCodec.CodecConfig(CODEC_BUFFER_BYTES, CODEC_BUFFER_BYTES) { input, output -> output.put(input) },
        )
    }

    private fun loading(uri: String): Loaded {
        platformDecoders()
        val engine = ExoVoiceNoteEngine(ApplicationProvider.getApplicationContext()).also(engines::add)
        val outcome = Outcome()
        engine.listen(
            onPrepared = { outcome.prepared = true },
            onCompleted = {},
            onError = { outcome.failed = true },
        )
        engine.load(uri)
        idleUntil { outcome.settled }
        return Loaded(engine, outcome)
    }

    private fun idleUntil(condition: () -> Boolean) {
        val deadline = System.nanoTime() + Duration.ofSeconds(10).toNanos()
        while (!condition() && System.nanoTime() < deadline) {
            shadowOf(Looper.getMainLooper()).idleFor(Duration.ofMillis(10))
            Thread.sleep(1)
        }
    }

    private fun fixture(name: String): String =
        requireNotNull(javaClass.getResource("/voice/$name")) { "fixture $name absente" }.toURI().toString()

    @Test
    fun `a translated voice note in Ogg Opus is prepared on Android 9`() {
        val outcome = loading(fixture("translated-voice-note.opus")).outcome

        assertThat(outcome.failed).isFalse()
        assertThat(outcome.prepared).isTrue()
    }

    @Test
    fun `a translated voice note in Ogg Opus reports its duration for the scrubber and the skips`() {
        val engine = loading(fixture("translated-voice-note.opus")).engine

        assertThat(engine.durationMs).isIn(Range.closed(1_900L, 2_100L))
    }

    @Test
    fun `the speed chosen in the message menu reaches the player of a translated voice note`() {
        val engine = loading(fixture("translated-voice-note.opus")).engine

        engine.setSpeed(1.5f)

        assertThat(engine.speed).isEqualTo(1.5f)
    }

    @Test
    fun `an original voice note in M4A is still prepared`() {
        val outcome = loading(fixture("original-voice-note.m4a")).outcome

        assertThat(outcome.failed).isFalse()
        assertThat(outcome.prepared).isTrue()
    }

    @Test
    fun `a voice note that cannot be read reports a failure instead of playing in silence`() {
        val missing = File.createTempFile("absent", ".opus").apply { delete() }

        val outcome = loading(missing.toURI().toString()).outcome

        assertThat(outcome.prepared).isFalse()
        assertThat(outcome.failed).isTrue()
    }

    private companion object {
        const val CODEC_BUFFER_BYTES = 64 * 1024
    }
}
