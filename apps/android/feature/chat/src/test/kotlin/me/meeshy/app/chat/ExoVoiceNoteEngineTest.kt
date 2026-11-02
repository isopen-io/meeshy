package me.meeshy.app.chat

import android.content.Context
import android.media.MediaFormat
import android.os.Looper
import androidx.media3.common.MediaItem
import androidx.media3.common.util.UnstableApi
import androidx.media3.exoplayer.source.DefaultMediaSourceFactory
import androidx.test.core.app.ApplicationProvider
import com.google.common.collect.Range
import com.google.common.truth.Truth.assertThat
import java.io.ByteArrayInputStream
import java.io.File
import java.net.URI
import java.time.Duration
import java.util.UUID
import me.meeshy.sdk.model.mediacache.MediaCacheCategory
import me.meeshy.ui.component.media.MeeshyMediaCache
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
@UnstableApi
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [28])
class ExoVoiceNoteEngineTest {

    private class LeaseLog {
        val opened = mutableListOf<String>()
        var released = 0
    }

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

    private fun leased(log: LeaseLog) = VoiceNoteSources { url ->
        log.opened += url
        VoiceNoteSource(
            source = DefaultMediaSourceFactory(ApplicationProvider.getApplicationContext<Context>())
                .createMediaSource(MediaItem.fromUri(url)),
            release = { log.released += 1 },
        )
    }

    private fun engineOver(sources: VoiceNoteSources?): Loaded {
        platformDecoders()
        val context = ApplicationProvider.getApplicationContext<Context>()
        val engine = ExoVoiceNoteEngine(context, sources ?: VoiceNoteSources.cached(context)).also(engines::add)
        val outcome = Outcome()
        engine.listen(
            onPrepared = { outcome.prepared = true },
            onCompleted = {},
            onError = { outcome.failed = true },
        )
        return Loaded(engine, outcome)
    }

    private fun loading(uri: String, sources: VoiceNoteSources? = null): Loaded {
        val loaded = engineOver(sources)
        loaded.engine.load(uri)
        idleUntil { loaded.outcome.settled }
        return loaded
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

    @Test
    fun `a voice note is read through the source the engine was given`() {
        val log = LeaseLog()
        val url = fixture("original-voice-note.m4a")

        val outcome = loading(url, leased(log)).outcome

        assertThat(log.opened).containsExactly(url)
        assertThat(outcome.failed).isFalse()
        assertThat(outcome.prepared).isTrue()
    }

    @Test
    fun `the lease is held while the voice note is loaded and given back when it is reset`() {
        val log = LeaseLog()
        val engine = loading(fixture("original-voice-note.m4a"), leased(log)).engine
        assertThat(log.released).isEqualTo(0)

        engine.reset()
        engine.reset()

        assertThat(log.released).isEqualTo(1)
    }

    @Test
    fun `loading another voice note gives the previous lease back`() {
        val log = LeaseLog()
        val engine = loading(fixture("original-voice-note.m4a"), leased(log)).engine

        engine.load(fixture("translated-voice-note.opus"))

        assertThat(log.opened).hasSize(2)
        assertThat(log.released).isEqualTo(1)
    }

    @Test
    fun `releasing the engine gives the lease back`() {
        val log = LeaseLog()
        val engine = loading(fixture("original-voice-note.m4a"), leased(log)).engine

        engine.release()

        assertThat(log.released).isEqualTo(1)
    }

    @Test
    fun `a protected voice note never goes through the cache source`() {
        val log = LeaseLog()
        val loaded = engineOver(leased(log))

        loaded.engine.loadUncached(fixture("original-voice-note.m4a"))
        idleUntil { loaded.outcome.settled }

        assertThat(log.opened).isEmpty()
        assertThat(loaded.outcome.prepared).isTrue()
    }

    @Test
    fun `a voice note already in the audio cache plays again with no network`() {
        val url = "https://gate.meeshy.me/api/v1/attachments/file/2026/10/${UUID.randomUUID()}/heard.m4a"
        val bytes = File(URI(fixture("original-voice-note.m4a"))).readBytes()
        val context = ApplicationProvider.getApplicationContext<Context>()
        val adopted = MeeshyMediaCache.get(context).adopt(MediaCacheCategory.AUDIO, url, bytes.size.toLong()) {
            ByteArrayInputStream(bytes)
        }
        assertThat(adopted).isTrue()

        val outcome = loading(url).outcome

        assertThat(outcome.failed).isFalse()
        assertThat(outcome.prepared).isTrue()
    }

    private companion object {
        const val CODEC_BUFFER_BYTES = 64 * 1024
    }
}
