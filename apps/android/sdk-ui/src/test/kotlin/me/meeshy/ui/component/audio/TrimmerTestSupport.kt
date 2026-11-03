package me.meeshy.ui.component.audio

internal class RecordingTrimPort : TrimClipPort {
    val loads = mutableListOf<Triple<String, Long, Long>>()
    var playing = false
    override fun load(uri: String, startMs: Long, endMs: Long) { loads += Triple(uri, startMs, endMs) }
    override fun play() { playing = true }
    override fun pause() { playing = false }
    override fun seekToSegmentStart() = Unit
    override val segmentPositionMs: Long get() = 0L
    override val isPlaying: Boolean get() = playing
    override fun release() = Unit
}

internal object ManualTrimClock : TrimFrameClock {
    override fun start(onFrame: () -> Unit) = Unit
    override fun stop() = Unit
}
