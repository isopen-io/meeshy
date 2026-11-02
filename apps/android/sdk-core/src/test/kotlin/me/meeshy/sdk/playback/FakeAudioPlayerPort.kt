package me.meeshy.sdk.playback

import me.meeshy.sdk.model.media.AttachmentStatusBody
import me.meeshy.sdk.model.media.PlaybackReportSink
import me.meeshy.sdk.model.playback.MediaResumeMerge.StampedPosition

/** Un lecteur factice : enregistre les ordres et laisse le test jouer le rôle du matériel. */
internal class FakeAudioPlayerPort : AudioPlayerPort {
    private var currentListener: AudioPlayerPort.Listener? = null
    val loads = mutableListOf<Triple<AudioSource, Int, Float>>()
    val seeks = mutableListOf<Long>()
    var playing = false
    var position = 0L
    var currentSpeed = 1f
    var stops = 0
    var failNextLoad = false

    val lastGeneration: Int get() = loads.last().second

    override fun setListener(listener: AudioPlayerPort.Listener?) {
        currentListener = listener
    }

    override fun load(source: AudioSource, generation: Int, speed: Float) {
        if (failNextLoad) {
            failNextLoad = false
            error("source refusée")
        }
        loads += Triple(source, generation, speed)
        currentSpeed = speed
        playing = false
        position = 0L
    }

    override fun play() { playing = true }
    override fun pause() { playing = false }
    override fun seekTo(positionMs: Long) { seeks += positionMs; position = positionMs }
    override fun setSpeed(speed: Float) { currentSpeed = speed }
    override fun positionMs(): Long = position
    override fun stop() { stops += 1; playing = false }
    override fun release() { currentListener = null }

    fun prepare(durationMs: Long, generation: Int = lastGeneration) = currentListener!!.onPrepared(generation, durationMs)
    fun end(generation: Int = lastGeneration) = currentListener!!.onEnded(generation)
    fun fail(generation: Int = lastGeneration) = currentListener!!.onError(generation, RuntimeException("boom"))
    fun playWhenReady(value: Boolean, generation: Int = lastGeneration) {
        playing = value
        currentListener!!.onPlayWhenReadyChanged(generation, value)
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
