package me.meeshy.sdk.model.fullscreen

import me.meeshy.sdk.model.media.PlaybackSpeed

public object AudioFullscreenSpeed {
    public val steps: List<PlaybackSpeed> = emptyList()
    public fun next(current: PlaybackSpeed): PlaybackSpeed = current
    public fun previous(current: PlaybackSpeed): PlaybackSpeed = current
}
