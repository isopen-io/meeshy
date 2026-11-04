package me.meeshy.sdk.model.fullscreen

import me.meeshy.sdk.model.ApiMessage
import me.meeshy.sdk.model.ConversationClearance

public enum class AudioFullscreenAction { REACT, REPLY, FORWARD, COMPOSE }

public data class AudioFullscreenOffer(
    val react: Boolean,
    val reply: Boolean,
    val forward: Boolean,
    val compose: Boolean,
) {
    public val actions: List<AudioFullscreenAction> get() = emptyList()

    public val isEmpty: Boolean get() = true

    public companion object {
        public val None: AudioFullscreenOffer = AudioFullscreenOffer(react = false, reply = false, forward = false, compose = false)

        public fun resolve(
            isProtected: Boolean,
            hasCarrier: Boolean,
            carrierInWindow: Boolean,
            conversationClear: Boolean,
            forwardable: Boolean,
            composable: Boolean,
        ): AudioFullscreenOffer = None

        public fun of(
            carrier: ApiMessage?,
            pieceId: String,
            inWindow: Boolean,
            conversationIsEncrypted: Boolean,
            clearance: ConversationClearance,
        ): AudioFullscreenOffer = None
    }
}
