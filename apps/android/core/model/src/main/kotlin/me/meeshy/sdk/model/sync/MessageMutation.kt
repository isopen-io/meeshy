package me.meeshy.sdk.model.sync

import me.meeshy.sdk.model.ApiMessage

/**
 * Une mutation de message annoncée par la passerelle (miroir de `RealtimeMessageMutation`, iOS) : les trois
 * événements qui changent un message DÉJÀ connu. Chacune s'applique deux fois sans effet de plus
 * ([MessageMutationApplier]) : le même broadcast reçu par le relais permanent ET par la conversation
 * ouverte n'a aucun double effet.
 */
sealed interface MessageMutation {
    val conversationId: String
    val messageId: String

    /** `message:edited` : le message ENTIER, modifié sur place par la passerelle. */
    data class Edited(val message: ApiMessage) : MessageMutation {
        override val conversationId: String get() = message.conversationId
        override val messageId: String get() = message.id
    }

    /** `message:deleted` : suppression demandée par un membre. */
    data class Deleted(
        override val conversationId: String,
        override val messageId: String,
        val deletedAt: String? = null,
    ) : MessageMutation

    /** `message:expired` : suppression par le serveur d'un message éphémère arrivé à échéance. */
    data class Expired(
        override val conversationId: String,
        override val messageId: String,
    ) : MessageMutation
}
