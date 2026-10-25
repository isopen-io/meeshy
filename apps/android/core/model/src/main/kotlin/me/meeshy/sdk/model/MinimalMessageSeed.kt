package me.meeshy.sdk.model

import me.meeshy.sdk.model.push.PushPayload

/**
 * La forme APPAUVRIE d'un message, quand l'appelant n'a rien de plus riche que les six champs
 * d'un data-message FCM — miroir de `MessagePersistenceActor.IncomingMessageData` (iOS).
 *
 * Elle sert à ce qu'un message poussé conversation fermée soit déjà en base à l'ouverture, pas
 * à le décrire : elle ne s'insère que si la ligne est ABSENTE, n'écrase jamais un payload riche,
 * et le REST suivant la complète par [MessageMergePolicy] (pièces, expéditeur, citation…).
 */
data class MinimalMessageSeed(
    val id: String,
    val conversationId: String,
    val senderId: String?,
    val content: String,
    val createdAt: String?,
    val effectFlags: Int? = null,
    val ephemeralDuration: Int? = null,
) {
    /** Le message minimal tel qu'il s'écrit en cache, avant que le REST ne le complète. */
    fun toApiMessage(): ApiMessage = ApiMessage(
        id = id,
        conversationId = conversationId,
        senderId = senderId,
        content = content,
        createdAt = createdAt,
        effectFlags = effectFlags,
        ephemeralDuration = ephemeralDuration,
    )

    companion object {
        /** Seuls ces types portent un message neuf de fil (`NotificationTypeEnum`, passerelle). */
        private val MESSAGE_TYPES = setOf("new_message", "message_reply")

        /**
         * La graine d'un push, ou `null` quand il ne décrit pas un message neuf identifiable.
         *
         * Fail-closed : la bannière d'un message protégé (`notificationLocKey`, drapeau de cycle de
         * vie, éphémère) est un libellé générique, jamais le texte — la graine reste alors sans
         * texte plutôt que d'écrire ce libellé comme s'il était le message. Une pièce jointe
         * annoncée laisse aussi le texte vide : le corps n'est alors qu'un résumé (« Photo »).
         */
        fun fromPush(payload: PushPayload): MinimalMessageSeed? {
            val type = payload.type ?: return null
            if (type !in MESSAGE_TYPES) return null
            val id = payload.messageId ?: return null
            val conversationId = payload.conversationId ?: return null
            val textTravels = payload.mediaMayTravel && payload.firstAttachmentUrl == null
            return MinimalMessageSeed(
                id = id,
                conversationId = conversationId,
                senderId = payload.senderId,
                content = if (textTravels) payload.body.orEmpty() else "",
                createdAt = payload.createdAt,
                effectFlags = payload.effectFlags,
                ephemeralDuration = payload.ephemeralDuration,
            )
        }
    }
}
