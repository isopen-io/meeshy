package me.meeshy.sdk.model.composer.timeline.engine

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.StoryAudioPlayerObject
import me.meeshy.sdk.model.StoryMediaObject
import me.meeshy.sdk.model.timeline.TimelineProject
import org.junit.Test

/** Le moteur d'aperçu : une ancre commune, seek précis/tolérant, fins de seek périmées ignorées. */
class TimelineEngineControllerTest {

    private class FakeVideo(override val hasVideo: Boolean, override var status: VideoItemStatus? = VideoItemStatus.READY) : TimelineVideoPort {
        var position = 0.0
        val starts = mutableListOf<Long?>()
        var pauses = 0
        val seeks = mutableListOf<Pair<Double, Long>>()
        val pendingSeekDone = mutableListOf<(Boolean) -> Unit>()
        override fun positionSeconds() = position
        override fun start(anchorNanos: Long?) { starts += anchorNanos }
        override fun pause() { pauses++ }
        override fun seekTo(seconds: Double, toleranceMs: Long, onDone: (Boolean) -> Unit) {
            seeks += seconds to toleranceMs
            pendingSeekDone += onDone
        }
    }

    private class FakeAudio(var failure: Exception? = null) : TimelineAudioPort {
        val plays = mutableListOf<Pair<Double, Long>>()
        var pauses = 0
        val seeks = mutableListOf<Double>()
        override fun play(timelineSeconds: Double, anchorNanos: Long) {
            failure?.let { throw it }
            plays += timelineSeconds to anchorNanos
        }
        override fun pause() { pauses++ }
        override fun seek(timelineSeconds: Double) { seeks += timelineSeconds }
    }

    private val project = TimelineProject(
        slideId = "s", slideDuration = 10f,
        mediaObjects = listOf(StoryMediaObject(id = "v", mediaType = "video", startTime = 0.0, duration = 10.0)),
        audioPlayerObjects = listOf(StoryAudioPlayerObject(id = "a", startTime = 2f, duration = 3f)),
    )

    private fun engine(video: FakeVideo, audio: FakeAudio = FakeAudio(), now: Long = 1_000_000_000L) =
        TimelineEngineController(video, audio) { now }.also { it.configure(project) }

    @Test
    fun `video et audio partent a la meme ancre`() {
        val video = FakeVideo(hasVideo = true)
        val audio = FakeAudio()
        engine(video, audio).play()
        assertThat(video.starts).containsExactly(1_050_000_000L)
        assertThat(audio.plays.single().second).isEqualTo(1_050_000_000L)
    }

    @Test
    fun `un item pas pret fait attendre video et son, puis ils partent ensemble`() {
        val video = FakeVideo(hasVideo = true, status = VideoItemStatus.UNKNOWN)
        val audio = FakeAudio()
        val engine = engine(video, audio)
        engine.play()
        assertThat(video.starts).isEmpty()
        assertThat(audio.plays).isEmpty()
        video.status = VideoItemStatus.READY
        engine.onVideoStatusChanged()
        assertThat(video.starts).hasSize(1)
        assertThat(audio.plays).hasSize(1)
    }

    @Test
    fun `un item en echec joue sans ancre pour que le son parte`() {
        val video = FakeVideo(hasVideo = true, status = VideoItemStatus.FAILED)
        val audio = FakeAudio()
        engine(video, audio).play()
        assertThat(video.starts).containsExactly(null)
        assertThat(audio.plays).hasSize(1)
    }

    @Test
    fun `la pause pendant l'attente annule le depart`() {
        val video = FakeVideo(hasVideo = true, status = VideoItemStatus.UNKNOWN)
        val engine = engine(video)
        engine.play()
        engine.pause()
        video.status = VideoItemStatus.READY
        engine.onVideoStatusChanged()
        assertThat(video.starts).isEmpty()
    }

    @Test
    fun `le seek de geste est tolerant et celui du relache est precis`() {
        val video = FakeVideo(hasVideo = true)
        val engine = engine(video)
        engine.seek(3f, precise = false)
        engine.seek(4f, precise = true)
        assertThat(video.seeks).containsExactly(3.0 to 50L, 4.0 to 0L).inOrder()
    }

    @Test
    fun `une fin de seek perimee par un geste posterieur est ignoree`() {
        val video = FakeVideo(hasVideo = true)
        val audio = FakeAudio()
        val engine = engine(video, audio)
        engine.play()
        audio.plays.clear()
        engine.seek(3f, precise = false)
        engine.seek(5f, precise = true)
        video.pendingSeekDone[0](true)
        assertThat(audio.plays).isEmpty()
        video.pendingSeekDone[1](true)
        assertThat(audio.plays).hasSize(1)
    }

    @Test
    fun `en lecture l'audio se tait pendant le seek`() {
        val video = FakeVideo(hasVideo = true)
        val audio = FakeAudio()
        val engine = engine(video, audio)
        engine.play()
        val before = audio.pauses
        engine.seek(2f)
        assertThat(audio.pauses).isEqualTo(before + 1)
    }

    @Test
    fun `sans video l'horloge interne derive de l'ancre et finit la lecture`() {
        val video = FakeVideo(hasVideo = false)
        val audio = FakeAudio()
        val engine = engine(video, audio)
        var ended = 0
        engine.onPlaybackEnd = { ended++ }
        engine.play()
        engine.tick(nowSeconds = 1.05 + 4.0)
        assertThat(engine.currentTime).isWithin(1e-3f).of(4f)
        engine.tick(nowSeconds = 1.05 + 99.0)
        assertThat(engine.currentTime).isEqualTo(10f)
        assertThat(engine.isPlaying).isFalse()
        assertThat(ended).isEqualTo(1)
    }

    @Test
    fun `l'audio part depuis la tete courante sans video`() {
        val video = FakeVideo(hasVideo = false)
        val audio = FakeAudio()
        val engine = engine(video, audio)
        engine.seek(3f)
        engine.play()
        assertThat(audio.plays.single().first).isEqualTo(3.0)
    }

    @Test
    fun `une panne audio n'arrete pas la video et remonte une erreur`() {
        val video = FakeVideo(hasVideo = true)
        val audio = FakeAudio(failure = IllegalStateException("moteur"))
        val engine = engine(video, audio)
        var error: TimelineEngineError? = null
        engine.onError = { error = it }
        engine.play()
        assertThat(video.starts).hasSize(1)
        assertThat(error).isInstanceOf(TimelineEngineError.AudioEngineUnavailable::class.java)
    }

    @Test
    fun `le clip franchi n'est signale qu'au changement`() {
        val video = FakeVideo(hasVideo = true)
        val engine = engine(video)
        val seen = mutableListOf<String>()
        engine.onElementBecameActive = { seen += it }
        engine.onVideoTime(2.5)
        engine.onVideoTime(2.6)
        engine.onVideoTime(7.0)
        assertThat(seen).containsExactly("a", "v").inOrder()
    }

    @Test
    fun `replay depuis zero quand la fin est atteinte sans video`() {
        val engine = engine(FakeVideo(hasVideo = false))
        engine.seek(10f)
        engine.play()
        assertThat(engine.currentTime).isEqualTo(0f)
    }
}
