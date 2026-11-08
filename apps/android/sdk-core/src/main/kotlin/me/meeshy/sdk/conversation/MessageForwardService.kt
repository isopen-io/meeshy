package me.meeshy.sdk.conversation

import javax.inject.Inject
import javax.inject.Singleton
import me.meeshy.sdk.lang.LanguageResolver
import me.meeshy.sdk.model.MeeshyUser
import me.meeshy.sdk.model.MessageEffects
import me.meeshy.sdk.model.share.OutgoingShare

/**
 * **Le chemin UNIQUE qui re-poste un message** (miroir de `MessageForwardService`, iOS) — extrait du fil : le transfert
 * d'un message, le partage vers plusieurs destinataires et la légende passent tous par ici, et personne ne reconstruit à
 * la main une bulle locale + une entrée de file.
 *
 * - **Marque interne** : un transfert porte son origine ([OutgoingShare.forwardedFromId]) ; la passerelle recopie alors
 *   les pièces de la source, le client n'envoie jamais d'`attachmentIds`. **Marque externe** : un texte, un lien, une
 *   carte ou une légende n'a aucune origine Meeshy, il part comme un message ordinaire.
 * - Une conversation source inconnue (vide) s'OMET plutôt que de partir comme `""` — la passerelle la lit en `ObjectId`.
 * - La copie emporte la protection de sa source (flamme, flou) : [OutgoingShare.effectFlags] et sa durée.
 * - [clientMessageId] stable ⇒ un rejeu retrouve sa bulle ([MessageRepository.sendOptimistic]) : la passerelle
 *   déduplique `(conversationId, clientMessageId)`, jamais un doublon.
 */
@Singleton
class MessageForwardService @Inject constructor(
    private val messages: MessageRepository,
) {

    /** Un transfert (marque interne) : le message porte l'identité de sa source. */
    fun isInternal(share: OutgoingShare): Boolean = !share.forwardedFromId.isNullOrBlank()

    /** Re-poste [share] dans [conversationId] ; rend l'identifiant `cid_` de la bulle. */
    suspend fun post(
        share: OutgoingShare,
        conversationId: String,
        sender: MeeshyUser,
        clientMessageId: String? = null,
        copyAttachmentsFromMessageId: String? = null,
    ): String {
        val internal = isInternal(share)
        return messages.sendOptimistic(
            conversationId = conversationId,
            content = share.content,
            originalLanguage = share.originalLanguage?.takeIf { it.isNotBlank() }
                ?: sender.systemLanguage?.takeIf { it.isNotBlank() }
                ?: LanguageResolver.FALLBACK_LANGUAGE,
            sender = sender,
            forwardedFromId = share.forwardedFromId?.takeIf { internal },
            forwardedFromConversationId = share.forwardedFromConversationId?.takeIf { internal && it.isNotBlank() },
            forwardedAttachmentIds = share.forwardedAttachmentIds?.takeIf { internal },
            effects = MessageEffects(flags = share.effectFlags, ephemeralDuration = share.ephemeralDuration),
            clientMessageId = clientMessageId,
            copyAttachmentsFromMessageId = copyAttachmentsFromMessageId,
        )
    }
}
