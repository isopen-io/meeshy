package me.meeshy.sdk.model

import me.meeshy.sdk.model.piece.PieceSealing

/**
 * **Un vocal de la file est-il protégé ?** — la loi unique que le producteur de la file appelle pour remplir
 * [AudioQueueMessage.isProtected] et [AudioQueueAttachment.isProtected]. Un vocal protégé ne s'écrit jamais
 * sur le disque et ne montre rien de son contenu sur la carte système.
 *
 * [ofMessage] est le miroir de `ConversationViewModel.isProtectedVoice` (iOS : vue unique, flou, échéance,
 * chiffré), lu par les champs hérités OU le bitfield, et étendu à l'éphémère sans échéance (flamme, durée) que
 * le fil sert sans `expiresAt`. [ofPiece] ajoute la protection de la PIÈCE elle-même (leçon 275) ; le silence
 * de la pièce renvoie au message, comme `MessagePieceTarget`.
 */
public object VoiceQueueProtection {

    private const val PROTECTING_FLAGS: Long =
        MessageEffectFlags.VIEW_ONCE or MessageEffectFlags.BLURRED or MessageEffectFlags.EPHEMERAL

    public fun ofMessage(message: ApiMessage): Boolean =
        message.isViewOnce == true ||
            message.isBlurred == true ||
            message.expiresAt != null ||
            message.ephemeralDuration != null ||
            message.isEncrypted == true ||
            message.isEndToEndSealed ||
            EndToEndRegime.isEndToEnd(message.encryptionMode) ||
            ((message.effectFlags?.toLong() ?: 0L) and PROTECTING_FLAGS) != 0L

    public fun ofPiece(piece: ApiMessageAttachment, carrier: ApiMessage): Boolean =
        ofMessage(carrier) ||
            piece.isViewOnce == true ||
            piece.isBlurred == true ||
            PieceSealing.isSealed(piece) ||
            ((piece.effectFlags ?: 0L) and AttachmentProtection.MASKING_FLAGS) != 0L
}
