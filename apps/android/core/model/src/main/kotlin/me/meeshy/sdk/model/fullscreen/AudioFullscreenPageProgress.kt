package me.meeshy.sdk.model.fullscreen

import me.meeshy.sdk.model.MeeshyMediaConsumption
import me.meeshy.sdk.model.playback.AudioPlaybackState

public object AudioFullscreenPageProgress {
    public fun fraction(
        pageAttachmentId: String,
        engine: AudioPlaybackState,
        localPositionMs: Long?,
        served: MeeshyMediaConsumption?,
        declaredDurationMs: Long,
    ): Double = -1.0
}
