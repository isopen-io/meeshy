package me.meeshy.ui.component.audio

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class AudioTrimPreviewPlayerTest {

    private class FakePort : TrimClipPort {
        var loaded: Triple<String, Long, Long>? = null
        var positionMs = 0L
        var playing = false
        var released = false
        var seekedToStart = 0
        override fun load(uri: String, startMs: Long, endMs: Long) { loaded = Triple(uri, startMs, endMs); positionMs = 0 }
        override fun play() { playing = true }
        override fun pause() { playing = false }
        override fun seekToSegmentStart() { seekedToStart++; positionMs = 0 }
        override val segmentPositionMs: Long get() = positionMs
        override val isPlaying: Boolean get() = playing
        override fun release() { released = true }
    }

    private class FakeClock : TrimFrameClock {
        var running = false
        override fun start(onFrame: () -> Unit) { running = true }
        override fun stop() { running = false }
    }

    private fun player(port: FakePort = FakePort(), clock: FakeClock = FakeClock()) =
        Triple(AudioTrimPreviewPlayer(port, clock).also { it.load("file:///a.m4a") }, port, clock)

    @Test
    fun `la lecture charge le segment borne et demarre l'horloge`() {
        val (p, port, clock) = player()
        p.play(2.0, 5.0)
        assertThat(port.loaded).isEqualTo(Triple("file:///a.m4a", 2000L, 5000L))
        assertThat(p.isPlaying.value).isTrue()
        assertThat(clock.running).isTrue()
        assertThat(p.playhead.value).isEqualTo(2.0)
    }

    @Test
    fun `la tete avance avec le lecteur tant que la borne haute n'est pas atteinte`() {
        val (p, port, _) = player()
        p.play(2.0, 5.0)
        port.positionMs = 1500
        p.onFrame()
        assertThat(p.playhead.value).isEqualTo(3.5)
        assertThat(p.isPlaying.value).isTrue()
    }

    @Test
    fun `a la borne haute l'horloge arrete la lecture et repose au debut du segment`() {
        val (p, port, clock) = player()
        p.play(2.0, 5.0)
        port.positionMs = 3000
        p.onFrame()
        assertThat(p.isPlaying.value).isFalse()
        assertThat(p.playhead.value).isEqualTo(2.0)
        assertThat(port.playing).isFalse()
        assertThat(port.seekedToStart).isEqualTo(1)
        assertThat(clock.running).isFalse()
    }

    @Test
    fun `une fin naturelle du lecteur repose aussi au debut du segment`() {
        val (p, port, _) = player()
        p.play(2.0, 5.0)
        port.positionMs = 1000
        port.playing = false
        p.onFrame()
        assertThat(p.isPlaying.value).isFalse()
        assertThat(p.playhead.value).isEqualTo(2.0)
    }

    @Test
    fun `rejouer repart toujours du debut du segment et jamais de la position courante`() {
        val (p, port, _) = player()
        p.play(2.0, 5.0)
        port.positionMs = 1000
        p.onFrame()
        p.pause()
        p.play(1.0, 4.0)
        assertThat(port.loaded).isEqualTo(Triple("file:///a.m4a", 1000L, 4000L))
        assertThat(p.playhead.value).isEqualTo(1.0)
    }

    @Test
    fun `sans source rien ne joue et un segment vide est refuse`() {
        val port = FakePort()
        val p = AudioTrimPreviewPlayer(port, FakeClock())
        p.play(0.0, 3.0)
        assertThat(port.loaded).isNull()
        p.load("x")
        p.play(3.0, 3.0)
        assertThat(port.loaded).isNull()
    }

    @Test
    fun `la liberation arrete l'horloge et rend le lecteur`() {
        val (p, port, clock) = player()
        p.play(0.0, 2.0)
        p.release()
        assertThat(clock.running).isFalse()
        assertThat(port.released).isTrue()
    }
}
