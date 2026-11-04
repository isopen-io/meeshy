package me.meeshy.sdk.model.fullscreen

import me.meeshy.sdk.model.playback.MediaResumeMerge

public object AudioFullscreenResting {

    public fun storedPositionMs(stored: MediaResumeMerge.StampedPosition?, durationMs: Long): Long? = stored?.positionMs
}
