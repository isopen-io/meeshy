package me.meeshy.sdk.conversation

import androidx.room.withTransaction
import java.util.concurrent.ConcurrentHashMap
import kotlinx.coroutines.CancellationException
import kotlinx.serialization.encodeToString
import me.meeshy.core.database.MeeshyDatabase
import me.meeshy.core.database.dao.ConversationDao
import me.meeshy.core.database.dao.MessageDao
import me.meeshy.core.database.dao.SearchIndexDao
import me.meeshy.core.database.entity.ConversationEntity
import me.meeshy.sdk.lang.ReaderPrism
import me.meeshy.sdk.model.ApiConversation
import me.meeshy.sdk.model.ApiMessage
import me.meeshy.sdk.model.ConversationUpdatedSocketEvent
import me.meeshy.sdk.model.ParticipantBannedEvent
import me.meeshy.sdk.model.ParticipantJoinedEvent
import me.meeshy.sdk.model.ParticipantLeftEvent
import me.meeshy.sdk.model.ParticipantUnbannedEvent
import me.meeshy.sdk.model.conversationlist.ConversationLivePatch
import me.meeshy.sdk.model.conversationlist.LastMessageFacet
import me.meeshy.sdk.model.conversationlist.admitsLastMessage
import me.meeshy.sdk.model.conversationlist.applyingLastMessage
import me.meeshy.sdk.model.isoToEpochMillisOrNull
import me.meeshy.sdk.net.MeeshyApi
import me.meeshy.sdk.net.api.ConversationApi
import me.meeshy.sdk.search.LocalSearchIndex
import me.meeshy.sdk.session.SessionRepository
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Patch EN PLACE de la liste : une trame temps réel (message, mise à jour, effectif, non-lu) se plie
 * dans la ligne Room qu'elle concerne, dans une transaction, sans aucune relecture de `GET
 * /conversations`. La liste observe Room : la ligne, l'aperçu, le badge et le tri changent aussitôt,
 * hors ligne comprise. Miroir de l'écriture socket du moteur de synchro iOS
 * (`ConversationSyncEngine+Socket`).
 *
 * Une conversation INCONNUE (trame, push) est récupérée par id UNE seule fois — les demandes
 * concurrentes pour le même id se fondent — et insérée en tête. Les règles vivent dans
 * [ConversationLivePatch] et [LastMessageFacet] (`:core:model`) ; cette classe n'est que le
 * transport vers Room.
 */
@Singleton
class ConversationLivePatcher @Inject constructor(
    private val database: MeeshyDatabase,
    private val conversationDao: ConversationDao,
    private val messageDao: MessageDao,
    private val conversationApi: ConversationApi,
    private val session: SessionRepository,
    private val readerLabel: ReaderLabelProvider,
) {
    private val discoveries: MutableSet<String> = ConcurrentHashMap.newKeySet()

    /** `message:new` : la ligne remonte en tête avec la facette COMPLÈTE du message, si elle est plus récente. */
    suspend fun applyMessage(message: ApiMessage): Boolean {
        val facet = LastMessageFacet.of(
            message = message,
            readerId = readerId(),
            youLabel = readerLabel.youLabel(),
            viewerLanguages = viewerLanguages(),
        )
        val alias = message.clientMessageId?.let(::listOf).orEmpty()
        val known = mutate(message.conversationId) { row ->
            if (!row.admitsLastMessage(facet.id, facet.createdAtMillis, alias)) row else row.applyingLastMessage(facet)
        }
        if (known == Known.ABSENT) discover(message.conversationId)
        return known != Known.ABSENT
    }

    /** `conversation:updated` : métadonnées et groupe d'aperçu ; inconnue ⇒ découverte. */
    suspend fun applyUpdated(event: ConversationUpdatedSocketEvent): Boolean {
        val known = mutate(event.conversationId) { row ->
            ConversationLivePatch.applyUpdated(row, event, readerId(), readerLabel.youLabel()) ?: row
        }
        if (known == Known.ABSENT) discover(event.conversationId)
        return known != Known.ABSENT
    }

    /** `conversation:unread-updated` : le compteur absolu du serveur. */
    suspend fun applyUnread(conversationId: String, unreadCount: Int) {
        mutate(conversationId) { row -> ConversationLivePatch.applyUnread(row, unreadCount) ?: row }
    }

    /** Un membre arrive : +1 (soi ignoré), l'effectif absolu du serveur prime. */
    suspend fun applyJoined(event: ParticipantJoinedEvent) {
        if (event.userId != null && event.userId == readerId()) return
        mutate(event.conversationId) { row ->
            ConversationLivePatch.applyMemberCount(row, delta = 1, absolute = event.memberCount, capped = event.memberCountCapped)
                ?: row
        }
    }

    /** Un membre part : moi ⇒ la conversation disparaît ; un autre ⇒ −1. */
    suspend fun applyLeft(event: ParticipantLeftEvent) {
        if (event.names(readerId().orEmpty())) {
            remove(event.conversationId)
        } else {
            mutate(event.conversationId) { row -> ConversationLivePatch.applyMemberCount(row, delta = -1) ?: row }
        }
    }

    /** Un membre est banni : moi ⇒ la conversation disparaît ; un autre ⇒ −1. */
    suspend fun applyBanned(event: ParticipantBannedEvent) {
        if (event.names(readerId().orEmpty())) {
            remove(event.conversationId)
        } else {
            mutate(event.conversationId) { row -> ConversationLivePatch.applyMemberCount(row, delta = -1) ?: row }
        }
    }

    /** Un bannissement est levé : +1 seulement si l'appartenance est rendue. */
    suspend fun applyUnbanned(event: ParticipantUnbannedEvent) {
        if (event.membershipRestored == false) return
        if (event.names(readerId().orEmpty())) {
            discover(event.conversationId)
            return
        }
        mutate(event.conversationId) { row ->
            ConversationLivePatch.applyMemberCount(row, delta = 1, absolute = event.memberCount, capped = event.memberCountCapped)
                ?: row
        }
    }

    /** Retire la ligne ET invalide le cache de ses messages (supprimée, quittée, bannie, fermée). */
    suspend fun remove(conversationId: String) {
        if (conversationId.isBlank()) return
        database.withTransaction {
            conversationDao.deleteByIds(listOf(conversationId))
            messageDao.clearConversation(conversationId)
        }
    }

    /**
     * Chemin FCM : une notification qui nomme une conversation encore inconnue la fait apparaître
     * sans attendre la prochaine synchro. Câblé par le lot de navigation de notification.
     */
    suspend fun applyPush(type: String, conversationId: String?) {
        if (conversationId.isNullOrBlank() || type !in DISCOVERY_PUSH_TYPES) return
        discover(conversationId)
    }

    /** Récupère une conversation inconnue par id (une seule requête en vol par id) et l'insère en tête. */
    suspend fun discover(conversationId: String) {
        if (conversationId.isBlank() || conversationDao.find(conversationId) != null) return
        if (!discoveries.add(conversationId)) return
        try {
            val fetched = conversationApi.getById(conversationId).data ?: return
            val now = System.currentTimeMillis()
            database.withTransaction {
                if (conversationDao.find(conversationId) == null) {
                    conversationDao.upsertAll(listOf(entityOf(fetched, now, previous = null)))
                }
            }
            runCatching { LocalSearchIndex(SearchIndexDao(database)).indexConversation(fetched) }
        } catch (cancelled: CancellationException) {
            throw cancelled
        } catch (_: Exception) {
            // Silencieux : la prochaine synchro ou le tirer-pour-rafraîchir la ramènera.
        } finally {
            discoveries.remove(conversationId)
        }
    }

    private enum class Known { PRESENT, ABSENT }

    private suspend fun mutate(conversationId: String, transform: (ApiConversation) -> ApiConversation): Known =
        database.withTransaction {
            val row = conversationDao.find(conversationId) ?: return@withTransaction Known.ABSENT
            val current = runCatching { MeeshyApi.json.decodeFromString<ApiConversation>(row.payload) }.getOrNull()
                ?: return@withTransaction Known.PRESENT
            val next = transform(current)
            if (next != current) conversationDao.upsertAll(listOf(entityOf(next, row.cachedAt, previous = row)))
            Known.PRESENT
        }

    private fun entityOf(conversation: ApiConversation, cachedAt: Long, previous: ConversationEntity?): ConversationEntity {
        val rank = maxOf(ConversationLivePatch.rankMillis(conversation), previous?.updatedAt ?: 0L)
        val fallback = isoToEpochMillisOrNull(conversation.updatedAt) ?: 0L
        return ConversationEntity(
            id = conversation.id,
            payload = MeeshyApi.json.encodeToString(conversation),
            updatedAt = maxOf(rank, fallback),
            cachedAt = cachedAt,
            unreadCount = conversation.unreadCount,
        )
    }

    private fun readerId(): String? = session.currentUser.value?.id

    private fun viewerLanguages(): List<String> =
        session.currentUser.value?.let(ReaderPrism::resolve).orEmpty()

    private companion object {
        val DISCOVERY_PUSH_TYPES = setOf("new_conversation_direct", "new_conversation_group", "added_to_conversation")
    }
}
