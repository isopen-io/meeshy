package me.meeshy.sdk.playback

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class VideoPlayerPoolTest {
    private class Port(override var playsLocalFile: Boolean = true, override var isReady: Boolean = true) : VideoPlayerPort {
        var released = false
        var loadedUri: String? = null
        var audioTracks: Boolean? = null
        private var listener: VideoPlayerPort.Listener? = null
        override fun setListener(listener: VideoPlayerPort.Listener?) { this.listener = listener }
        override fun load(source: VideoSource, generation: Int, speed: Float) { loadedUri = source.uri }
        override fun play() {}
        override fun pause() {}
        override fun seekTo(positionMs: Long) {}
        override fun setSpeed(speed: Float) {}
        override fun setMuted(muted: Boolean) {}
        override fun setAudioTracksEnabled(enabled: Boolean) { audioTracks = enabled }
        override fun setLooping(looping: Boolean) {}
        override fun queueLoopSuccessor(): Boolean = true
        override fun dropLoopSuccessors() {}
        override fun positionMs(): Long = 0L
        override fun stop() {}
        override fun release() { released = true }
        fun prepared(durationMs: Long) = listener?.onPrepared(0, durationMs)
    }

    private fun newPool(capacity: Int, created: MutableList<Port> = mutableListOf()) =
        VideoPlayerPool(VideoPlayerPortFactory { Port().also(created::add) }, { capacity }) to created

    private fun src(name: String) = VideoSource("file:///$name", isLocalFile = true)

    @Test
    fun `le pool evince le plus loin du reel affiche puis le plus ancien`() {
        val (pool, created) = newPool(2)
        pool.declareDistances(mapOf("a" to -1, "b" to 1, "c" to 1))
        pool.prepare("a", src("a"))
        pool.prepare("b", src("b"))
        pool.declareDistances(mapOf("a" to -3, "b" to 1, "c" to 1))
        pool.prepare("c", src("c"))
        assertThat(pool.keys).containsExactly("b", "c")
        assertThat(created[0].released).isTrue()
    }

    @Test
    fun `un candidat qui serait aussitot evince ne depense aucun decodeur`() {
        val (pool, created) = newPool(1)
        pool.declareDistances(mapOf("near" to 1, "far" to 5))
        pool.prepare("near", src("near"))
        assertThat(pool.prepare("far", src("far"))).isFalse()
        assertThat(created).hasSize(1)
        assertThat(pool.keys).containsExactly("near")
    }

    @Test
    fun `a distance egale le plus ancien part`() {
        val (pool, _) = newPool(2)
        pool.declareDistances(mapOf("a" to 1, "b" to 1, "c" to 1))
        pool.prepare("a", src("a"))
        pool.prepare("b", src("b"))
        pool.prepare("c", src("c"))
        assertThat(pool.keys).containsExactly("b", "c")
    }

    @Test
    fun `un lecteur prepare sur le flux est jete quand le fichier local existe`() {
        val (pool, created) = newPool(2)
        pool.prepare("a", VideoSource("https://x/a.mp4", isLocalFile = false))
        created[0].playsLocalFile = false
        assertThat(pool.take("a", localFileOnDisk = true)).isNull()
        assertThat(created[0].released).isTrue()
    }

    @Test
    fun `un lecteur sur le fichier local est adopte avec sa duree`() {
        val (pool, created) = newPool(2)
        pool.prepare("a", src("a"))
        created[0].prepared(4_000)
        val adopted = pool.take("a", localFileOnDisk = true)
        assertThat(adopted?.port).isSameInstanceAs(created[0])
        assertThat(adopted?.durationMs).isEqualTo(4_000L)
        assertThat(pool.size).isEqualTo(0)
    }

    @Test
    fun `le lecteur sortant pret revient au pool, un lecteur en echec est libere`() {
        val (pool, _) = newPool(2)
        val ready = Port()
        val broken = Port(isReady = false)
        assertThat(pool.giveBack("r", ready)).isTrue()
        assertThat(pool.giveBack("x", broken)).isFalse()
        assertThat(ready.released).isFalse()
        assertThat(broken.released).isTrue()
        assertThat(pool.keys).containsExactly("r")
    }

    @Test
    fun `un lecteur prepare est muet et sans piste audio`() {
        val (pool, created) = newPool(1)
        pool.prepare("a", src("a"))
        assertThat(created[0].audioTracks).isFalse()
    }
}
