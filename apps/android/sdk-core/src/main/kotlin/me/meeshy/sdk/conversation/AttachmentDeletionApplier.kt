package me.meeshy.sdk.conversation

import androidx.room.withTransaction
import java.time.Instant
import javax.inject.Inject
import javax.inject.Singleton
import kotlinx.serialization.encodeToString
import me.meeshy.core.database.MeeshyDatabase
import me.meeshy.core.database.dao.MessageDao
import me.meeshy.sdk.cache.CacheClock
import me.meeshy.sdk.model.ApiConversation
import me.meeshy.sdk.model.ApiMessage
import me.meeshy.sdk.model.AttachmentDeletedEvent
import me.meeshy.sdk.model.AttachmentRemovalDeltas
import me.meeshy.sdk.net.MeeshyApi
import me.meeshy.sdk.session.AccountFence
import me.meeshy.sdk.session.AccountTicket
import me.meeshy.sdk.session.commitOrWrite

/**
 * Applique `attachment:deleted` (#13609) au cache Room, SANS appel réseau : la pièce quitte la ligne du message (qui
 * devient une pierre tombale s'il ne lui reste ni texte ni pièce, comme la suppression locale) et l'aperçu de la ligne
 * de liste dont c'est le dernier message. Idempotent : un événement rejoué, ou pour une pièce que l'auteur a déjà
 * retirée localement, ne change rien et n'écrit rien. S'exécute sous le ticket posé par `collectArrived`.
 */
@Singleton
class AttachmentDeletionApplier internal constructor(
    private val database: MeeshyDatabase,
    private val updater: CachedMessageUpdater,
    private val clock: CacheClock,
    private val fence: AccountFence?,
) {
    @Inject
    constructor(
        database: MeeshyDatabase,
        messageDao: MessageDao,
        clock: CacheClock,
        fence: AccountFence?,
    ) : this(database, CachedMessageUpdater(database, messageDao, fence), clock, fence)

    suspend fun apply(event: AttachmentDeletedEvent) {
        if (event.messageId.isBlank() || event.attachmentId.isBlank()) return
        val ticket = updater.ticket()
        val deletedAt = Instant.ofEpochMilli(clock.nowMillis()).toString()
        var tombstoned = false
        updater.update(ticket, event.messageId, requireSynced = false) { message ->
            AttachmentRemovalDeltas.message(message, event.conversationId, event.attachmentId, deletedAt).also {
                tombstoned = it !== message && it.deletedAt != null && message.deletedAt == null
            }
        }
        if (tombstoned) database.editRevisionDao().deleteForMessage(event.messageId)
        patchListPreview(event, ticket)
    }

    private suspend fun patchListPreview(event: AttachmentDeletedEvent, ticket: AccountTicket?) {
        fence.commitOrWrite(ticket) {
            database.withTransaction {
                val row = database.conversationDao().find(event.conversationId) ?: return@withTransaction
                val conversation = MeeshyApi.json.decodeFromString<ApiConversation>(row.payload)
                val previous = if (conversation.lastMessage?.id == event.messageId) previousMessage(event) else null
                val patched = AttachmentRemovalDeltas.preview(conversation, event.messageId, event.attachmentId, previous)
                if (patched === conversation) return@withTransaction
                database.conversationDao().upsertAll(listOf(row.copy(payload = MeeshyApi.json.encodeToString(patched))))
            }
        }
    }

    /** Le message vivant qui précède celui qu'on vide : le plus récent encore lisible du cache. */
    private suspend fun previousMessage(event: AttachmentDeletedEvent): ApiMessage? =
        database.messageDao().recentForConversation(event.conversationId, PREVIOUS_WINDOW)
            .filter { it.id != event.messageId && it.serverId != event.messageId && it.sendState == null }
            .mapNotNull { runCatching { MeeshyApi.json.decodeFromString<ApiMessage>(it.payload) }.getOrNull() }
            .firstOrNull { it.deletedAt.isNullOrBlank() && (it.content.isNotBlank() || it.attachments.isNotEmpty()) }

    private companion object {
        const val PREVIOUS_WINDOW = 20
    }
}
