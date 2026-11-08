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
import me.meeshy.sdk.model.BridgeAnnouncement
import me.meeshy.sdk.model.ApiMessage
import me.meeshy.sdk.model.MessageDeletedEvent
import me.meeshy.sdk.model.ConversationUpdatedSocketEvent
import me.meeshy.sdk.model.ParticipantBannedEvent
import me.meeshy.sdk.model.ParticipantJoinedEvent
import me.meeshy.sdk.model.ParticipantLeftEvent
import me.meeshy.sdk.model.ParticipantRoleUpdatedEvent
import me.meeshy.sdk.model.ParticipantUnbannedEvent
import me.meeshy.sdk.model.conversationlist.ConversationLivePatch
import me.meeshy.sdk.model.conversationlist.ConversationPreviewOnSend
import me.meeshy.sdk.model.conversationlist.LastMessageFacet
import me.meeshy.sdk.model.conversationlist.applyingLastMessage
import me.meeshy.sdk.model.conversationlist.revertingDeletion
import me.meeshy.sdk.model.sync.ConversationPatch
import me.meeshy.sdk.model.sync.ParticipantFold
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
    private val openConversations: OpenConversationLookup = OpenConversationLookup.None,
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
        val me = readerId()
        val mine = !me.isNullOrBlank() && (message.senderId == me || message.sender?.resolvedUserId == me)
        val countsAsUnread = !mine && !openConversations.isOpen(message.conversationId)
        val known = mutate(message.conversationId) { row ->
            ConversationPatch.receivingMessage(row, facet, alias, countsAsUnread)
        }
        if (known == Known.ABSENT) discover(message.conversationId)
        return known != Known.ABSENT
    }

    /**
     * MON envoi optimiste : la ligne remonte avec la facette de la bulle `cid_…` avant tout accusé, hors ligne
     * comprise. Le non-lu ne bouge pas (c'est mon message) ; un aperçu plus récent n'est pas reculé.
     */
    suspend fun applyStaged(message: ApiMessage): Boolean {
        val facet = LastMessageFacet.of(
            message = message,
            readerId = readerId(),
            youLabel = readerLabel.youLabel(),
            viewerLanguages = viewerLanguages(),
        )
        return mutate(message.conversationId) { row -> ConversationPreviewOnSend.staging(row, facet) } != Known.ABSENT
    }

    /**
     * La bulle optimiste [sentId] a été retirée : si elle était l'aperçu, la ligne revient au dernier message
     * restant de Room (jamais le texte de ce qui a disparu), sinon elle ne bouge pas.
     */
    suspend fun applyRolledBack(conversationId: String, sentId: String) {
        val previous = messageDao.recentForConversation(conversationId, ROLLBACK_LOOKBACK)
            .firstOrNull { it.id != sentId && it.sendState != LocalSendState.FAILED.name }
            ?.toLocalMessage()?.message
        val facet = previous?.let {
            LastMessageFacet.of(
                message = it,
                readerId = readerId(),
                youLabel = readerLabel.youLabel(),
                viewerLanguages = viewerLanguages(),
            )
        }
        mutate(conversationId) { row -> ConversationPreviewOnSend.rollingBack(row, sentId, facet) }
    }

    /**
     * `message:edited` : si le message édité EST le dernier de la ligne, la facette entière est remplacée
     * (jamais l'auteur de l'ancien état sous le texte du nouveau) ; sinon la ligne ne bouge pas.
     */
    suspend fun applyEdited(message: ApiMessage): Boolean {
        val facet = LastMessageFacet.of(
            message = message,
            readerId = readerId(),
            youLabel = readerLabel.youLabel(),
            viewerLanguages = viewerLanguages(),
        )
        val known = mutate(message.conversationId) { row ->
            if (row.lastMessage?.id != message.id) row else row.applyingLastMessage(facet)
        }
        return known != Known.ABSENT
    }

    /**
     * `message:deleted` : le dernier message supprimé, la ligne revient au précédent que le serveur sert
     * (vide seulement si la relecture échoue) ; un `conversation:updated` plus récent n'est pas écrasé.
     */
    suspend fun applyDeleted(event: MessageDeletedEvent) {
        val current = conversationDao.find(event.conversationId)
            ?.let { runCatching { MeeshyApi.json.decodeFromString<ApiConversation>(it.payload) }.getOrNull() }
        if (current?.lastMessage?.id != event.messageId) return
        val server = try {
            conversationApi.getById(event.conversationId).data
        } catch (cancelled: CancellationException) {
            throw cancelled
        } catch (_: Exception) {
            null
        }
        mutate(event.conversationId) { row -> row.revertingDeletion(event.messageId, server) ?: row }
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
    suspend fun applyUnread(conversationId: String, unreadCount: Int, bridge: BridgeAnnouncement = BridgeAnnouncement.NotComputed) {
        mutate(conversationId) { row -> ConversationLivePatch.applyUnread(row, unreadCount, bridge) ?: row }
    }

    /** Un membre arrive : +1 (soi ignoré), l'effectif absolu du serveur prime. */
    suspend fun applyJoined(event: ParticipantJoinedEvent) {
        if (event.userId != null && event.userId == readerId()) return
        mutate(event.conversationId) { row ->
            ConversationLivePatch.applyMemberCount(row, delta = 1, absolute = event.memberCount, capped = event.memberCountCapped)
                ?: row
        }
    }

    /** Un membre part : moi ⇒ la conversation disparaît (rend `true`) ; un autre ⇒ roster et effectif −1. */
    suspend fun applyLeft(event: ParticipantLeftEvent): Boolean {
        if (event.names(readerId().orEmpty())) return removed(event.conversationId)
        mutate(event.conversationId) { row -> folded(row, ParticipantFold.left(row, event, readerId())) }
        return false
    }

    /** Un membre est banni : moi ⇒ la conversation disparaît (rend `true`) ; un autre ⇒ roster et effectif −1. */
    suspend fun applyBanned(event: ParticipantBannedEvent): Boolean {
        if (event.names(readerId().orEmpty())) return removed(event.conversationId)
        mutate(event.conversationId) { row -> folded(row, ParticipantFold.banned(row, event, readerId())) }
        return false
    }

    /** `participant:role-updated` : le rang du lecteur et celui de la ligne du roster. */
    suspend fun applyRoleUpdated(event: ParticipantRoleUpdatedEvent) {
        mutate(event.conversationId) { row -> ParticipantFold.roleUpdated(row, event, readerId()) ?: row }
    }

    private suspend fun removed(conversationId: String): Boolean {
        remove(conversationId)
        return conversationId.isNotBlank()
    }

    private fun folded(row: ApiConversation, outcome: ParticipantFold.Outcome): ApiConversation =
        (outcome as? ParticipantFold.Outcome.Updated)?.conversation ?: row

    /** Un bannissement est levé : +1 seulement si l'appartenance est rendue. */
    suspend fun applyUnbanned(event: ParticipantUnbannedEvent) {
        if (event.memberCount == null && event.membershipRestored == false) return
        if (event.names(readerId().orEmpty())) {
            discover(event.conversationId)
            return
        }
        mutate(event.conversationId) { row ->
            ConversationLivePatch.applyMemberCount(row, delta = 1, absolute = event.memberCount, capped = event.memberCountCapped)
                ?: row
        }
    }

    /**
     * Un départ, un bannissement ou un changement de rôle d'un participant, plié par [ParticipantFold] :
     * `Removed` retire la conversation (le lecteur en est sorti), `Updated` écrit la ligne, `Unchanged` ne
     * touche à rien. Idempotent : rejouer l'événement ne bouge plus la ligne.
     */
    suspend fun applyParticipant(conversationId: String, fold: (ApiConversation) -> ParticipantFold.Outcome) {
        var removed = false
        mutate(conversationId) { row ->
            when (val outcome = fold(row)) {
                ParticipantFold.Outcome.Removed -> row.also { removed = true }
                is ParticipantFold.Outcome.Updated -> outcome.conversation
                ParticipantFold.Outcome.Unchanged -> row
            }
        }
        if (removed) remove(conversationId)
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
        if (conversationId.isBlank()) return
        if (!discoveries.add(conversationId)) return
        try {
            if (conversationDao.find(conversationId) != null) return
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
        const val ROLLBACK_LOOKBACK = 8
        val DISCOVERY_PUSH_TYPES = setOf("new_conversation_direct", "new_conversation_group", "added_to_conversation")
    }
}
