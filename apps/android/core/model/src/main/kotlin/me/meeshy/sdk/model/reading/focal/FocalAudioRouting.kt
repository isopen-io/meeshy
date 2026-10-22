package me.meeshy.sdk.model.reading.focal

/** Comment une rangée plate héberge ses pièces audio — miroir de `FocalAudioMode` (iOS). */
enum class FocalAudioMode { None, Stack, SoleWithFooter, HostsReply, HostsCaption, Standalone }

/** Forme des pièces jointes d'un message, miroir de `BubbleContent.Attachments`. */
enum class FocalAttachmentShape { None, VisualGrid, Audio, NonMedia, Mixed }

/**
 * Faits primitifs du routage audio. [hasTextOrNonMediaContent] suit la règle de la
 * bulle : faux pour un audio PUR dont le texte est sa transcription (le widget audio le
 * rend lui-même).
 */
data class FocalAudioRoutingInput(
    val shape: FocalAttachmentShape,
    val audioCount: Int,
    val visualCount: Int = 0,
    val isEmojiOnly: Boolean = false,
    val hasTextOrNonMediaContent: Boolean = false,
    val hasReply: Boolean = false,
)

/**
 * Routage audio TOTAL : une seule décision, jamais deux pieds, jamais de légende
 * dupliquée. Un audio pur avec texte reste « seul avec pied » (le texte EST la
 * transcription).
 */
object FocalAudioRouting {

    fun audioHostsReply(input: FocalAudioRoutingInput): Boolean =
        input.hasReply && !input.isEmojiOnly && !input.hasTextOrNonMediaContent &&
            input.shape == FocalAttachmentShape.Audio

    fun visualHostsReply(input: FocalAudioRoutingInput): Boolean =
        input.hasReply && !input.isEmojiOnly && !input.hasTextOrNonMediaContent &&
            input.shape == FocalAttachmentShape.VisualGrid

    fun mode(input: FocalAudioRoutingInput): FocalAudioMode {
        val audioCount = when (input.shape) {
            FocalAttachmentShape.Audio, FocalAttachmentShape.Mixed -> input.audioCount
            else -> 0
        }
        if (audioCount <= 0) return FocalAudioMode.None
        if (input.shape == FocalAttachmentShape.Audio && audioCount > 1) return FocalAudioMode.Stack

        val isSoleContent = !input.isEmojiOnly && !input.hasTextOrNonMediaContent && !input.hasReply
        if (isSoleContent) return FocalAudioMode.SoleWithFooter
        if (audioHostsReply(input)) return FocalAudioMode.HostsReply

        val visualCount = if (input.shape == FocalAttachmentShape.Mixed) input.visualCount else 0
        val hostsCaption = !visualHostsReply(input) && input.hasTextOrNonMediaContent &&
            !input.hasReply && visualCount == 0
        return if (hostsCaption) FocalAudioMode.HostsCaption else FocalAudioMode.Standalone
    }
}
