package me.meeshy.app.chat

import com.google.common.truth.Truth.assertThat
import org.junit.Test

/**
 * L'aperçu audio du menu d'un message (#13862) lit par le MÊME moteur que le fil ([VoiceNoteEngine],
 * Media3) : sous Android 9, `MediaPlayer` sautait l'Ogg Opus d'un vocal traduit et l'aperçu défilait
 * en silence. Ces témoins tiennent ce que chaque contrôle du menu fait au moteur — chargement, départ
 * à la vitesse choisie, vitesse changée en lecture, ±5 s, curseur, fin et erreur.
 */
class OverlayAudioPreviewTest {

    private class FakeEngine(override var durationMs: Long = 0L) : VoiceNoteEngine {
        val calls = mutableListOf<String>()
        override var positionMs: Long = 0L
        var prepared: () -> Unit = {}
        var completed: () -> Unit = {}
        var failed: () -> Unit = {}

        override fun listen(onPrepared: () -> Unit, onCompleted: () -> Unit, onError: () -> Unit) {
            prepared = onPrepared
            completed = onCompleted
            failed = onError
        }

        override fun load(url: String) {
            calls += "load:$url"
        }

        override fun start() {
            calls += "start"
        }

        override fun pause() {
            calls += "pause"
        }

        override fun seekTo(positionMs: Long) {
            calls += "seek:$positionMs"
        }

        override fun setSpeed(rate: Float) {
            calls += "speed:$rate"
        }

        override fun reset() {
            calls += "reset"
        }

        override fun release() {
            calls += "release"
        }
    }

    private class Harness(val engine: FakeEngine = FakeEngine()) {
        val published = mutableListOf<OverlayMediaTransport>()
        val preview = OverlayAudioPreview(engine) { published += it }
    }

    private val translated = "https://cdn.meeshy.me/a1/fr.opus"

    private fun playing(durationMs: Long = 20_000L): Harness = Harness(FakeEngine(durationMs)).apply {
        preview.toggle(translated)
        engine.prepared()
        preview.tick()
        engine.calls.clear()
    }

    @Test
    fun `play loads the translated track into the engine and waits for it to be ready`() {
        val h = Harness()

        h.preview.toggle(translated)

        assertThat(h.engine.calls).containsExactly("load:$translated")
        assertThat(h.preview.transport.isLoading).isTrue()
        assertThat(h.published.last().isLoading).isTrue()
    }

    @Test
    fun `a ready track starts at the speed chosen before it loaded`() {
        val h = Harness()
        h.preview.cycleRate()
        h.preview.toggle(translated)
        h.engine.calls.clear()

        h.engine.prepared()

        assertThat(h.engine.calls).containsExactly("speed:1.25", "start").inOrder()
        assertThat(h.preview.transport.isPlaying).isTrue()
        assertThat(h.preview.transport.isLoading).isFalse()
    }

    @Test
    fun `the speed chip changes the speed of the voice note being played`() {
        val h = playing()

        h.preview.cycleRate()

        assertThat(h.engine.calls).containsExactly("speed:1.25")
        assertThat(h.preview.transport.playbackRate).isEqualTo(1.25f)
    }

    @Test
    fun `skipping forward moves the engine five seconds ahead`() {
        val h = playing()
        h.engine.positionMs = 3_000L
        h.preview.tick()

        h.preview.skip(OverlayMediaTransport.SKIP_SECONDS)

        assertThat(h.engine.calls).containsExactly("seek:8000")
    }

    @Test
    fun `skipping back never goes before the start`() {
        val h = playing()
        h.engine.positionMs = 2_000L
        h.preview.tick()

        h.preview.skip(-OverlayMediaTransport.SKIP_SECONDS)

        assertThat(h.engine.calls).containsExactly("seek:0")
    }

    @Test
    fun `the scrubber seeks the engine to the chosen fraction`() {
        val h = playing()

        h.preview.seek(0.5)

        assertThat(h.engine.calls).containsExactly("seek:10000")
    }

    @Test
    fun `the playhead follows the engine while playing`() {
        val h = playing()
        h.engine.positionMs = 5_000L

        h.preview.tick()

        assertThat(h.preview.transport.currentSeconds).isEqualTo(5.0)
        assertThat(h.preview.transport.progress).isEqualTo(0.25)
        assertThat(h.published.last().percentInt).isEqualTo(25)
    }

    @Test
    fun `pause then play pauses and resumes the same track without reloading it`() {
        val h = playing()

        h.preview.toggle(translated)
        h.preview.toggle(translated)

        assertThat(h.engine.calls).containsExactly("pause", "speed:1.0", "start").inOrder()
    }

    @Test
    fun `a track played to the end rewinds and plays again from the start`() {
        val h = playing()

        h.engine.completed()
        h.preview.toggle(translated)

        assertThat(h.preview.transport.isPlaying).isTrue()
        assertThat(h.preview.transport.currentSeconds).isEqualTo(0.0)
        assertThat(h.engine.calls).containsExactly("speed:1.0", "start").inOrder()
    }

    @Test
    fun `a track the engine cannot read stops loading and stays paused`() {
        val h = Harness()
        h.preview.toggle(translated)

        h.engine.failed()

        assertThat(h.preview.transport.isLoading).isFalse()
        assertThat(h.preview.transport.isPlaying).isFalse()
    }

    @Test
    fun `closing the menu releases the engine`() {
        val h = playing()

        h.preview.release()

        assertThat(h.engine.calls).containsExactly("release")
    }
}
