package me.meeshy.app.chat

import me.meeshy.ui.component.bubble.BubbleAudio
import me.meeshy.ui.component.bubble.BubbleAudioPlayback

/**
 * The thread's single in-app voice-note player, as pure state: WHICH voice note is loaded
 * ([attachmentId]) and what its [transport] is doing. One voice note at a time, like iOS:
 * touching another one switches to it from the start; touching the same one toggles
 * play/pause. The platform player is driven by [ChatAudioPlayer]; every decision lives
 * here and in [OverlayMediaTransport].
 */
internal class ChatAudioPlayback private constructor(
    val attachmentId: String?,
    val transport: OverlayMediaTransport,
) {

    fun toggle(audio: BubbleAudio): ChatAudioPlayback {
        val url = audio.url?.takeIf { it.isNotBlank() } ?: return this
        val base = if (audio.attachmentId == attachmentId) transport else transport.stop()
        return ChatAudioPlayback(audio.attachmentId, base.toggle(url))
    }

    fun ready(): ChatAudioPlayback = with(transport.ready())

    fun failed(): ChatAudioPlayback = with(transport.failed())

    fun ended(): ChatAudioPlayback = with(transport.onEnded())

    fun tick(currentSeconds: Double, durationSeconds: Double): ChatAudioPlayback =
        with(transport.tick(currentSeconds, durationSeconds))

    /** What the bubble owning [bubbleAttachmentId] shows — `null` unless it is the loaded one. */
    fun bubbleFor(bubbleAttachmentId: String, declaredDurationSeconds: Int? = null): BubbleAudioPlayback? {
        if (bubbleAttachmentId != attachmentId || transport.currentUrl == null) return null
        return BubbleAudioPlayback(
            attachmentId = bubbleAttachmentId,
            isPlaying = transport.isPlaying,
            isLoading = transport.isLoading,
            progress = transport.progress.toFloat(),
            timeLabel = transport.timeLabel(declaredDurationSeconds),
        )
    }

    private fun with(next: OverlayMediaTransport): ChatAudioPlayback =
        if (next === transport) this else ChatAudioPlayback(attachmentId, next)

    companion object {
        val Idle: ChatAudioPlayback = ChatAudioPlayback(attachmentId = null, transport = OverlayMediaTransport.idle())
    }
}
