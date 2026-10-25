package me.meeshy.sdk.conversation

import androidx.room.withTransaction
import java.time.Instant
import javax.inject.Inject
import javax.inject.Singleton
import me.meeshy.core.database.MeeshyDatabase
import me.meeshy.core.database.dao.MessageDao
import me.meeshy.sdk.cache.CacheClock
import me.meeshy.sdk.model.ApiMessage
import me.meeshy.sdk.model.AttachmentReactionUpdateEvent
import me.meeshy.sdk.model.ConversationEventDeltas
import me.meeshy.sdk.model.ConversationSocketEvent
import me.meeshy.sdk.model.MessageConsumedEvent
import me.meeshy.sdk.model.MessageCountdownStartedEvent
import me.meeshy.sdk.model.MessageHiddenForMeEvent
import me.meeshy.sdk.model.MessagePinChanged
import me.meeshy.sdk.model.MessageRemoved
import me.meeshy.sdk.model.MessageViewOncePurgedEvent

/**
 * Applique à Room, SANS appel réseau, les événements du fil qui modifient un message déjà en cache
 * (miroir des écritures `MessagePersistenceActor` déclenchées par `ConversationSocketHandler`, iOS) :
 * suppression, expiration, épingle, échéance servie, masquage personnel, consommation et purge d'une
 * vue unique, réactions d'une pièce.
 *
 * La ligne est modifiée SUR PLACE (même clé, même rang) : la bulle ne saute pas. Une transformation
 * inerte ([ConversationEventDeltas] rend l'instance reçue) n'écrit rien, donc le fil ne recompose pas.
 * Les règles elles-mêmes vivent dans `:core:model` ; cette classe ne fait que lire, transformer, écrire.
 */
@Singleton
class MessageDeltaApplier internal constructor(
    private val database: MeeshyDatabase,
    private val updater: CachedMessageUpdater,
    private val clock: CacheClock,
) {
    @Inject
    constructor(
        database: MeeshyDatabase,
        messageDao: MessageDao,
        clock: CacheClock,
    ) : this(database, CachedMessageUpdater(database, messageDao), clock)

    /**
     * Applique [event] s'il est un delta local et rend `true` ; rend `false` pour un événement qui
     * n'est pas un delta de message (le consommateur le traite autrement). [viewerId] est l'utilisateur
     * courant : il départage l'échéance d'un éphémère (expéditeur ou destinataire) et la consommation
     * d'une vue unique (soi ou un autre).
     */
    suspend fun apply(event: ConversationSocketEvent, viewerId: String?): Boolean {
        when (event) {
            is MessageRemoved -> remove(event)
            is MessagePinChanged -> transform(event.messageId) { pin(it, event) }
            is MessageCountdownStartedEvent -> transform(event.messageId) { message ->
                ConversationEventDeltas.servedDeadline(message, event.expiresAt, viewerIsSender = message.isFrom(viewerId))
            }
            is MessageHiddenForMeEvent -> purge(event.messages.map { it.messageId })
            is MessageConsumedEvent -> transform(event.messageId) { ConversationEventDeltas.consumed(it, event, viewerId) }
            is MessageViewOncePurgedEvent -> transform(event.messageId) { ConversationEventDeltas.viewOncePurged(it) }
            is AttachmentReactionUpdateEvent -> transform(event.messageId) {
                ConversationEventDeltas.attachmentReactions(it, event.attachmentId, event.reactionSummary)
            }
            else -> return false
        }
        return true
    }

    /**
     * Réaction OPTIMISTE de ce lecteur sur une pièce ; [adding] opposé est son retour arrière. Rend
     * `false` (rien d'écrit) quand le message est inconnu ou encore une bulle locale non acquittée.
     */
    suspend fun toggleAttachmentReaction(messageId: String, attachmentId: String, emoji: String, adding: Boolean): Boolean =
        updater.update(messageId, requireSynced = true) { message ->
            ConversationEventDeltas.attachmentReactionToggled(message, attachmentId, emoji, adding)
        } != null

    private suspend fun transform(messageId: String, delta: (ApiMessage) -> ApiMessage) {
        updater.update(messageId, requireSynced = false, transform = delta)
    }

    /** Une suppression pour tous laisse une pierre tombale ; une expiration retire la ligne. */
    private suspend fun remove(event: MessageRemoved) {
        if (event.expired) {
            purge(listOf(event.messageId))
        } else {
            transform(event.messageId) { ConversationEventDeltas.deleted(it, event.deletedAt ?: nowIso()) }
        }
    }

    private fun pin(message: ApiMessage, event: MessagePinChanged): ApiMessage =
        if (event.pinned) {
            ConversationEventDeltas.pinned(message, event.pinnedAt ?: message.pinnedAt ?: nowIso(), event.pinnedBy ?: message.pinnedBy)
        } else {
            ConversationEventDeltas.pinned(message, null, null)
        }

    /** Retire les lignes nommées (par l'une ou l'autre de leurs deux clés), en une transaction. */
    private suspend fun purge(messageIds: List<String>) {
        if (messageIds.isEmpty()) return
        database.withTransaction {
            val rowIds = messageIds.mapNotNull { MessageIdReconciliation.locate(database, it)?.id }.distinct()
            if (rowIds.isNotEmpty()) database.messageDao().deleteByIds(rowIds)
        }
    }

    private fun ApiMessage.isFrom(userId: String?): Boolean =
        userId != null && (senderId ?: sender?.resolvedUserId) == userId

    private fun nowIso(): String = Instant.ofEpochMilli(clock.nowMillis()).toString()
}
