package me.meeshy.sdk.conversation

import me.meeshy.sdk.mediahub.ConversationMediaHubIndex
import me.meeshy.sdk.model.ApiMessage
import me.meeshy.sdk.model.MessageTombstoning
import me.meeshy.sdk.model.PendingTombstone
import me.meeshy.sdk.model.QuotePropagation

/**
 * La suppression d'un message et son retour arrière — miroir de `markDeleted` / `markUndeleted`
 * (iOS, `MessagePersistenceActor+EditDelete`). Partagée par [MessageMutationWriter] (la suppression
 * optimiste et son retour) et [MessageDeltaApplier] (`message:deleted` du serveur).
 */
internal class MessageTombstoneWriter(
    private val updater: CachedMessageUpdater,
    private val revisions: EditRevisionLedger? = null,
    private val events: MessageEventBuffer? = null,
    private val mediaIndex: ConversationMediaHubIndex? = null,
) {

    /**
     * Une suppression annoncée par le SERVEUR (`message:deleted`). [sparingOpenedViewOnce] : une vue
     * unique devient « déjà ouverte », contenu purgé, au lieu de « Message supprimé ». Les citations du
     * message sont scellées. Un message encore inconnu garde sa pierre tombale pour l'arrivée de sa
     * ligne. `true` quand la ligne a été écrite.
     */
    suspend fun markDeleted(
        messageId: String,
        deletedAtIso: String,
        sparingOpenedViewOnce: Boolean = false,
        expired: Boolean = false,
    ): Boolean {
        val ticket = updater.ticket()
        val updated = updater.update(ticket, messageId, requireSynced = false) { message ->
            MessageTombstoning.delete(message, deletedAtIso, sparingOpenedViewOnce)
        }
        if (updated == null) {
            events?.rememberTombstone(messageId, PendingTombstone(deletedAtIso, sparingOpenedViewOnce, expired))
            return false
        }
        revisions?.forget(listOf(messageId))
        mediaIndex?.forgetMessage(updated.conversationId, messageId, ticket)
        if (updated.deletedAt != null) {
            followQuotes(ticket, updated) { reply -> QuotePropagation.sealDeleted(reply, parentIds(updated), deletedAtIso) }
        }
        return true
    }

    /**
     * Rend un message après un refus serveur de sa suppression (retour arrière de la suppression optimiste) :
     * la pierre tombale tombe, et le [snapshot] pris AVANT la suppression redonne texte, traductions et
     * pièces. Sans instantané, la ligne attend le prochain rafraîchissement pour retrouver son texte.
     */
    suspend fun markUndeleted(messageId: String, snapshot: ApiMessage? = null): Boolean =
        updater.update(messageId, requireSynced = false) { message ->
            if (message.deletedAt == null) {
                message
            } else if (snapshot == null) {
                message.copy(deletedAt = null)
            } else {
                message.copy(
                    deletedAt = null,
                    content = snapshot.content,
                    translations = snapshot.translations,
                    attachments = snapshot.attachments,
                )
            }
        } != null

    private suspend fun followQuotes(
        ticket: me.meeshy.sdk.session.AccountTicket?,
        parent: ApiMessage,
        transform: (ApiMessage) -> ApiMessage,
    ) = updater.updateCiting(ticket, parent.conversationId, parentIds(parent), transform)

    private fun parentIds(message: ApiMessage): List<String> = listOfNotNull(message.id, message.clientMessageId)
}
