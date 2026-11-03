package me.meeshy.sdk.playback

import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.test.runTest
import me.meeshy.sdk.model.playback.MediaSessionEvent
import me.meeshy.sdk.model.playback.VideoSurfaceRole
import org.junit.Test

class SharedVideoPlayerManagerTest {

    private class FakeVideoPort(override var playsLocalFile: Boolean = false) : VideoPlayerPort {
        override var isReady: Boolean = true
        var attachedListener: VideoPlayerPort.Listener? = null
        var generation = 0
        var source: VideoSource? = null
        var plays = 0
        var pauses = 0
        var released = false
        var loops = false
        var successors = 0
        var mutedByManager = false
        var position = 0L
        var seeks = mutableListOf<Long>()
        var stops = 0

        override fun setListener(listener: VideoPlayerPort.Listener?) { attachedListener = listener }
        override fun load(source: VideoSource, generation: Int, speed: Float) {
            this.source = source
            this.generation = generation
            playsLocalFile = source.isLocalFile
        }
        override fun play() { plays += 1 }
        override fun pause() { pauses += 1 }
        override fun seekTo(positionMs: Long) { seeks += positionMs; position = positionMs }
        override fun setSpeed(speed: Float) {}
        override fun setMuted(muted: Boolean) { mutedByManager = muted }
        override fun setLooping(looping: Boolean) { loops = looping }
        override fun queueLoopSuccessor(): Boolean { successors = 1; return true }
        override fun dropLoopSuccessors() { successors = 0 }
        override fun positionMs(): Long = position
        override fun stop() { stops += 1 }
        override fun release() { released = true }
    }

    private class Fixture {
        val port = FakeVideoPort()
        val coordinator = PlaybackCoordinator()
        val scope = CoroutineScope(Job() + Dispatchers.Unconfined)
        val manager = SharedVideoPlayerManager(
            portFactory = VideoPlayerPortFactory { port },
            coordinator = coordinator,
            scope = scope,
            tickMs = 1_000_000L,
        ).also(coordinator::register)
    }

    private fun fixture() = Fixture()

    private class FakeAudio(var stops: Int = 0) : CoordinatedPlayer {
        override val kind = CoordinatedPlayerKind.Audio
        override val isPlayingAudibly = true
        override fun stop() { stops += 1 }
    }

    @Test
    fun `demarrer une video eteint l audio et les autres lecteurs`() {
        val f = fixture()
        val audio = FakeAudio().also(f.coordinator::register)
        f.manager.load(VideoMedia(url = "https://m/a.mp4"))
        f.manager.play()
        assertThat(audio.stops).isEqualTo(1)
        assertThat(f.port.plays).isEqualTo(1)
    }

    @Test
    fun `un autre lecteur qui demarre arrete la video`() {
        val f = fixture()
        f.manager.load(VideoMedia(url = "https://m/a.mp4"))
        f.manager.play()
        f.coordinator.willStartPlaying(FakeAudio())
        assertThat(f.manager.state.value.activeMedia).isEmpty()
    }

    @Test
    fun `un seul media actif et le verdict de montage suit le media`() {
        val f = fixture()
        f.manager.load(VideoMedia(url = "https://m/a.mp4"))
        assertThat(f.manager.mayMountPlayer(VideoSurfaceRole.INLINE, "https://m/a.mp4")).isTrue()
        assertThat(f.manager.mayMountPlayer(VideoSurfaceRole.INLINE, "https://m/b.mp4")).isFalse()
        f.manager.setPictureInPictureActive(true)
        assertThat(f.manager.mayMountPlayer(VideoSurfaceRole.INLINE, "https://m/a.mp4")).isFalse()
        assertThat(f.manager.mayMountPlayer(VideoSurfaceRole.PICTURE_IN_PICTURE, "https://m/a.mp4")).isTrue()
    }

    @Test
    fun `la fin de flux emet complete une seule fois puis decharge`() = runTest {
        val f = fixture()
        val events = mutableListOf<VideoWatchEvent>()
        val job = CoroutineScope(Dispatchers.Unconfined).launchCollect(f.manager.events, events)
        f.manager.load(VideoMedia(url = "https://m/a.mp4", attachmentId = "att1"))
        f.manager.play()
        val gen = f.port.generation
        f.port.attachedListener!!.onEnded(gen)
        f.port.attachedListener?.onEnded(gen)
        assertThat(events.count { it.complete }).isEqualTo(1)
        assertThat(events.first { it.complete }.attachmentId).isEqualTo("att1")
        assertThat(f.manager.state.value.activeMedia).isEmpty()
        job.cancel()
    }

    @Test
    fun `en boucle la fin sans successeur rembobine et le tour enchaine par la file`() = runTest {
        val f = fixture()
        val events = mutableListOf<VideoWatchEvent>()
        val job = CoroutineScope(Dispatchers.Unconfined).launchCollect(f.manager.events, events)
        f.manager.setLooping(true)
        f.manager.load(VideoMedia(url = "https://m/a.mp4"))
        f.manager.play()
        assertThat(f.port.successors).isEqualTo(1)
        val gen = f.port.generation
        f.port.attachedListener!!.onLoopTurn(gen)
        assertThat(events.count { it.complete }).isEqualTo(1)
        assertThat(f.port.successors).isEqualTo(1)
        f.port.successors = 0
        f.port.attachedListener!!.onLoopTurn(gen)
        assertThat(events.count { it.complete }).isEqualTo(2)
        f.manager.setLooping(false)
        assertThat(f.port.successors).isEqualTo(0)
        job.cancel()
    }

    @Test
    fun `un rappel d une generation perimee est ignore`() {
        val f = fixture()
        f.manager.load(VideoMedia(url = "https://m/a.mp4"))
        val stale = f.port.generation
        f.manager.load(VideoMedia(url = "https://m/b.mp4"))
        f.port.attachedListener!!.onPrepared(stale, 9_000L)
        assertThat(f.manager.state.value.durationMs).isEqualTo(0L)
        f.port.attachedListener!!.onPrepared(f.port.generation, 4_000L)
        assertThat(f.manager.state.value.durationMs).isEqualTo(4_000L)
    }

    @Test
    fun `un lecteur prepare sur le flux est jete quand le fichier local existe`() {
        val f = fixture()
        val streaming = FakeVideoPort(playsLocalFile = false)
        f.manager.load(VideoMedia(url = "https://m/a.mp4", localFileUri = "file:///a.mp4"), PreparedVideo(streaming))
        assertThat(streaming.released).isTrue()
        assertThat(f.port.source).isEqualTo(VideoSource("file:///a.mp4", isLocalFile = true))
    }

    @Test
    fun `un lecteur prepare sur le fichier local est adopte`() {
        val f = fixture()
        val local = FakeVideoPort(playsLocalFile = true)
        f.manager.load(VideoMedia(url = "https://m/a.mp4", localFileUri = "file:///a.mp4"), PreparedVideo(local, 7_000L))
        assertThat(local.released).isFalse()
        assertThat(local.attachedListener).isNotNull()
        assertThat(f.manager.state.value.durationMs).isEqualTo(7_000L)
    }

    @Test
    fun `le mute global reste d une video a l autre et l intention de surface tombe`() {
        val f = fixture()
        f.manager.isMuted = true
        f.manager.isForceMuted = true
        f.manager.load(VideoMedia(url = "https://m/a.mp4"))
        f.manager.load(VideoMedia(url = "https://m/b.mp4"))
        assertThat(f.manager.isMuted).isTrue()
        assertThat(f.manager.isForceMuted).isFalse()
        assertThat(f.port.mutedByManager).isTrue()
    }

    @Test
    fun `couper le son clot le visionnage en cours`() = runTest {
        val f = fixture()
        val events = mutableListOf<VideoWatchEvent>()
        val job = CoroutineScope(Dispatchers.Unconfined).launchCollect(f.manager.events, events)
        f.manager.load(VideoMedia(url = "https://m/a.mp4"))
        f.manager.play()
        f.manager.isForceMuted = true
        assertThat(events).hasSize(1)
        assertThat(events.single().complete).isFalse()
        job.cancel()
    }

    @Test
    fun `une interruption met en pause et la reprise relance`() {
        val f = fixture()
        f.manager.load(VideoMedia(url = "https://m/a.mp4"))
        f.manager.play()
        f.manager.handleSessionEvent(MediaSessionEvent.InterruptionBegan)
        assertThat(f.port.pauses).isAtLeast(1)
        f.manager.handleSessionEvent(MediaSessionEvent.InterruptionEndedShouldResume)
        assertThat(f.port.plays).isEqualTo(2)
    }
}
