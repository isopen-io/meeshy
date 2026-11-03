package me.meeshy.sdk.playback

import me.meeshy.sdk.model.media.AttachmentStatusBody
import me.meeshy.sdk.model.media.PlaybackReportSink
import me.meeshy.sdk.model.playback.MediaResumeMerge.StampedPosition

/** Un lecteur factice : enregistre les ordres et laisse le test jouer le rôle du matériel. */
internal class FakeAudioPlayerPort : AudioPlayerPort {
    @set:JvmName("assignListener")
    var listener: AudioPlayerPort.Listener? = null
    val loads = mutableListOf<Triple<AudioSource, Int, Float>>()
    val seeks = mutableListOf<Long>()
    var playing = false
    var position = 0L
    @set:JvmName("assignSpeed")
    var speed = 1f
    var stops = 0
    var failNextLoad = false

    val lastGeneration: Int get() = loads.last().second

    override fun setListener(listener: AudioPlayerPort.Listener?) {
        this.listener = listener
    }

    override fun load(source: AudioSource, generation: Int, speed: Float) {
        if (failNextLoad) {
            failNextLoad = false
            error("source refusée")
        }
        loads += Triple(source, generation, speed)
        this.speed = speed
        playing = false
        position = 0L
    }

    override fun play() { playing = true }
    override fun pause() { playing = false }
    override fun seekTo(positionMs: Long) { seeks += positionMs; position = positionMs }
    override fun setSpeed(speed: Float) { this.speed = speed }
    override fun positionMs(): Long = position
    override fun stop() { stops += 1; playing = false }
    override fun release() { listener = null }

    fun prepare(durationMs: Long, generation: Int = lastGeneration) = listener!!.onPrepared(generation, durationMs)
    fun end(generation: Int = lastGeneration) = listener!!.onEnded(generation)
    fun fail(generation: Int = lastGeneration) = listener!!.onError(generation, RuntimeException("boom"))
    fun playWhenReady(value: Boolean, generation: Int = lastGeneration) {
        playing = value
        listener!!.onPlayWhenReadyChanged(generation, value)
    }
}

internal class InMemoryPositionStore : PlaybackPositionStore {
    val map = mutableMapOf<String, StampedPosition>()
    override fun position(attachmentId: String) = map[attachmentId]
    override fun save(attachmentId: String, positionMs: Long, savedAtEpochMs: Long) {
        map[attachmentId] = StampedPosition(positionMs, savedAtEpochMs)
    }
    override fun clear(attachmentId: String) { map.remove(attachmentId) }
    override fun clearAll() = map.clear()
}

internal class RecordingSink : PlaybackReportSink {
    val reports = mutableListOf<Pair<String, AttachmentStatusBody>>()
    override fun report(attachmentId: String, body: AttachmentStatusBody) {
        reports += attachmentId to body
    }
}
