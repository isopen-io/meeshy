package me.meeshy.sdk.playback

import me.meeshy.sdk.model.playback.MediaSessionEvent

internal class FakeFocusSystem(var grants: Boolean = true) : AudioFocusSystem {
    val requests = mutableListOf<FocusKind>()
    val abandoned = mutableListOf<FocusKind>()
    private val listeners = HashMap<FocusKind, (FocusChange) -> Unit>()

    override fun request(kind: FocusKind, onChange: (FocusChange) -> Unit): Boolean {
        requests += kind
        if (grants) listeners[kind] = onChange
        return grants
    }

    override fun abandon(kind: FocusKind) {
        abandoned += kind
    }

    fun deliver(kind: FocusKind, change: FocusChange) = listeners.getValue(kind)(change)
}

internal class FakeNoisySource : NoisyRouteSource {
    var registered = 0
        private set
    var unregistered = 0
        private set
    private var callback: (() -> Unit)? = null

    override fun register(onNoisy: () -> Unit): () -> Unit {
        registered += 1
        callback = onNoisy
        return { unregistered += 1 }
    }

    fun unplug() = callback?.invoke()
}

internal class FakePlayer(
    override val kind: CoordinatedPlayerKind = CoordinatedPlayerKind.Audio,
    override val respondsToSessionInterruptions: Boolean = false,
    var playing: Boolean = false,
    override val volumeTarget: PlaybackVolumeTarget? = null,
) : CoordinatedPlayer {
    init {
        strongRefs += this
    }

    var stops = 0
        private set
    val events = mutableListOf<MediaSessionEvent>()

    override val isPlayingAudibly: Boolean get() = playing

    override fun stop() {
        stops += 1
        playing = false
    }

    override fun handleSessionEvent(event: MediaSessionEvent) {
        events += event
    }
}

internal class FakeVolume(override var volume: Float) : PlaybackVolumeTarget

private val strongRefs = java.util.Collections.synchronizedList(mutableListOf<Any>())
