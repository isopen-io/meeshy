package me.meeshy.app.calls

import com.google.common.truth.Truth.assertThat
import org.junit.Test

/** #13692 — la voix locale entre dans le film du montage, calée sur l'horloge des images, et ne le retient jamais. */
class CallMontageSoundtrackTest {

    private class Sink : CallMontageMuxerSink<String> {
        val tracks = mutableListOf<String>()
        val writes = mutableListOf<Triple<Int, Long, Int>>()
        var started = false

        override fun addTrack(format: String): Int {
            check(!started) { "track added after start" }
            tracks += format
            return tracks.lastIndex
        }

        override fun start() {
            started = true
        }

        override fun write(track: Int, data: ByteArray, ptsUs: Long, flags: Int) {
            check(started) { "sample written before start" }
            writes += Triple(track, ptsUs, data.size)
        }

        fun ptsOf(format: String): List<Long> = writes.filter { tracks[it.first] == format }.map { it.second }
    }

    private fun bytes(n: Int = 4) = ByteArray(n)

    @Test
    fun `le film attend la piste de la voix puis porte l'image et le son`() {
        val sink = Sink()
        val mux = CallMontageMux(sink, expectsAudio = true)

        mux.videoFormat("avc", nowUs = 1_000_000)
        mux.video(bytes(), ptsUs = 1_000_000, flags = 1, nowUs = 1_000_000)
        assertThat(sink.started).isFalse()

        mux.audioFormat("aac", nowUs = 1_050_000)
        mux.audio(bytes(), ptsUs = 1_020_000, flags = 0, nowUs = 1_050_000)
        mux.video(bytes(), ptsUs = 1_066_000, flags = 0, nowUs = 1_066_000)

        assertThat(sink.started).isTrue()
        assertThat(sink.tracks).containsExactly("avc", "aac").inOrder()
        assertThat(sink.ptsOf("avc")).containsExactly(1_000_000L, 1_066_000L).inOrder()
        assertThat(sink.ptsOf("aac")).containsExactly(1_020_000L)
        assertThat(mux.carriesAudio).isTrue()
    }

    @Test
    fun `une voix qui ne vient pas ne retient pas le film, il part muet`() {
        val sink = Sink()
        val mux = CallMontageMux(sink, expectsAudio = true)

        mux.videoFormat("avc", nowUs = 0)
        mux.video(bytes(), ptsUs = 0, flags = 1, nowUs = 0)
        mux.video(bytes(), ptsUs = 500_000, flags = 0, nowUs = 500_000)
        assertThat(sink.started).isFalse()
        mux.video(bytes(), ptsUs = CallMontageMux.AUDIO_WAIT_US, flags = 0, nowUs = CallMontageMux.AUDIO_WAIT_US)

        assertThat(sink.tracks).containsExactly("avc")
        assertThat(sink.ptsOf("avc")).hasSize(3)
        mux.audioFormat("aac", nowUs = 2_000_000)
        mux.audio(bytes(), ptsUs = 2_000_000, flags = 0, nowUs = 2_000_000)
        assertThat(sink.tracks).containsExactly("avc")
        assertThat(mux.carriesAudio).isFalse()
    }

    @Test
    fun `sans micro attendu le film demarre a la premiere image`() {
        val sink = Sink()
        val mux = CallMontageMux(sink, expectsAudio = false)

        mux.videoFormat("avc", nowUs = 0)
        mux.video(bytes(), ptsUs = 0, flags = 1, nowUs = 0)

        assertThat(sink.started).isTrue()
        assertThat(sink.tracks).containsExactly("avc")
    }

    @Test
    fun `la voix d'avant la premiere image et celle qui recule sont ecartees`() {
        val sink = Sink()
        val mux = CallMontageMux(sink, expectsAudio = true)

        mux.audioFormat("aac", nowUs = 0)
        mux.audio(bytes(), ptsUs = 100_000, flags = 0, nowUs = 100_000)
        mux.videoFormat("avc", nowUs = 200_000)
        mux.video(bytes(), ptsUs = 200_000, flags = 1, nowUs = 200_000)
        mux.audio(bytes(), ptsUs = 210_000, flags = 0, nowUs = 220_000)
        mux.audio(bytes(), ptsUs = 205_000, flags = 0, nowUs = 230_000)
        mux.audio(bytes(), ptsUs = 231_000, flags = 0, nowUs = 240_000)

        assertThat(sink.ptsOf("aac")).containsExactly(210_000L, 231_000L).inOrder()
    }

    @Test
    fun `fermer un film qui attendait encore la voix ecrit ses images`() {
        val sink = Sink()
        val mux = CallMontageMux(sink, expectsAudio = true)

        mux.videoFormat("avc", nowUs = 0)
        mux.video(bytes(), ptsUs = 0, flags = 1, nowUs = 0)
        mux.flush()

        assertThat(sink.started).isTrue()
        assertThat(mux.videoSamples).isEqualTo(1)
    }

    @Test
    fun `un film sans image n'ouvre rien`() {
        val sink = Sink()
        val mux = CallMontageMux(sink, expectsAudio = true)

        mux.audioFormat("aac", nowUs = 0)
        mux.audio(bytes(), ptsUs = 0, flags = 0, nowUs = 0)
        mux.flush()

        assertThat(sink.started).isFalse()
        assertThat(mux.videoSamples).isEqualTo(0)
    }

    @Test
    fun `la voix se date sur l'horloge des images, au debut de chaque tampon`() {
        val timeline = CallMontageAudioTimeline()
        val tenMsMono48k = 960

        assertThat(timeline.stamp(tenMsMono48k, sampleRate = 48_000, channelCount = 1, arrivalUs = 5_010_000)).isEqualTo(5_000_000L)
        assertThat(timeline.stamp(tenMsMono48k, sampleRate = 48_000, channelCount = 1, arrivalUs = 5_045_000)).isEqualTo(5_010_000L)
        assertThat(timeline.stamp(tenMsMono48k, sampleRate = 48_000, channelCount = 1, arrivalUs = 5_046_000)).isEqualTo(5_020_000L)
    }

    @Test
    fun `apres un trou la voix se recale sur l'horloge plutot que de prendre du retard`() {
        val timeline = CallMontageAudioTimeline()
        val tenMsStereo48k = 1_920

        timeline.stamp(tenMsStereo48k, sampleRate = 48_000, channelCount = 2, arrivalUs = 10_000)
        val afterGap = timeline.stamp(tenMsStereo48k, sampleRate = 48_000, channelCount = 2, arrivalUs = 1_010_000)

        assertThat(afterGap).isEqualTo(1_000_000L)
    }

    @Test
    fun `un format qui change en cours de film est ecarte`() {
        val timeline = CallMontageAudioTimeline()

        timeline.stamp(960, sampleRate = 48_000, channelCount = 1, arrivalUs = 10_000)

        assertThat(timeline.stamp(320, sampleRate = 16_000, channelCount = 1, arrivalUs = 20_000)).isNull()
        assertThat(timeline.stamp(0, sampleRate = 48_000, channelCount = 1, arrivalUs = 30_000)).isNull()
    }
}
