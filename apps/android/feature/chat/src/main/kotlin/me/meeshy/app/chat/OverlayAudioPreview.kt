package me.meeshy.app.chat

import kotlin.math.roundToLong

/**
 * The message menu's audio preview, driven through the thread's [VoiceNoteEngine] (#13862): a
 * translated voice note is Ogg Opus, which `MediaPlayer` skips below Android 10, so the preview
 * plays on Media3 like the thread does. Every control turns into an [OverlayMediaTransport]
 * transition that is reconciled onto the engine, then published through [onChange].
 */
internal class OverlayAudioPreview(
    private val engine: VoiceNoteEngine,
    private val onChange: (OverlayMediaTransport) -> Unit,
) {
    var transport: OverlayMediaTransport = OverlayMediaTransport.idle()
        private set

    init {
        engine.listen(
            onPrepared = {
                engine.setSpeed(transport.playbackRate)
                engine.start()
                commit(transport.ready())
            },
            onCompleted = { commit(transport.onEnded()) },
            onError = { commit(transport.failed()) },
        )
    }

    fun toggle(url: String) = reconcile(transport.toggle(url))

    fun cycleRate() = reconcile(transport.cycleRate())

    fun skip(seconds: Double) = reconcile(transport.skip(seconds))

    fun seek(fraction: Double) = reconcile(transport.seek(fraction))

    fun tick() = commit(transport.tick(engine.positionMs / 1000.0, engine.durationMs / 1000.0))

    fun release() = engine.release()

    private fun reconcile(next: OverlayMediaTransport) {
        val prev = transport
        val url = next.currentUrl
        when {
            next.isLoading && url != null && url != prev.currentUrl -> engine.load(url)
            next.isPlaying && !prev.isPlaying -> {
                engine.setSpeed(next.playbackRate)
                engine.start()
            }
            !next.isPlaying && prev.isPlaying -> engine.pause()
        }
        if (!next.isLoading && next.currentSeconds != prev.currentSeconds) {
            engine.seekTo((next.currentSeconds * 1000).roundToLong())
        }
        if (next.playbackRate != prev.playbackRate && next.isPlaying) {
            engine.setSpeed(next.playbackRate)
        }
        commit(next)
    }

    private fun commit(next: OverlayMediaTransport) {
        transport = next
        onChange(next)
    }
}
