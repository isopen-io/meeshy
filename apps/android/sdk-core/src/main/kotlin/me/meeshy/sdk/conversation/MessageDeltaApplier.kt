package me.meeshy.sdk.conversation

import androidx.room.withTransaction
import java.time.Instant
import javax.inject.Inject
import javax.inject.Singleton
import me.meeshy.core.database.MeeshyDatabase
import me.meeshy.core.database.dao.MessageDao
import me.meeshy.sdk.cache.CacheClock
import me.meeshy.sdk.e2ee.PlaintextErasureLedger
import me.meeshy.sdk.mediahub.ConversationMediaHubIndex
import me.meeshy.sdk.model.ApiMessage
import me.meeshy.sdk.model.ApiMessageAttachment
import me.meeshy.sdk.model.AttachmentLiveDeltas
import me.meeshy.sdk.model.AttachmentReactionUpdateEvent
import me.meeshy.sdk.model.AttachmentReadyEvent
import me.meeshy.sdk.model.AttachmentStatusUpdatedEvent
import me.meeshy.sdk.model.ConversationEventDeltas
import me.meeshy.sdk.model.ConversationSocketEvent
import me.meeshy.sdk.model.MessageAttachmentUpdatedEvent
import me.meeshy.sdk.model.MessageCitedPostWithdrawnEvent
import me.meeshy.sdk.model.MessageConsumedEvent
import me.meeshy.sdk.model.MessageCountdownStartedEvent
import me.meeshy.sdk.model.MessageHiddenForMeEvent
import me.meeshy.sdk.model.MessagePinChanged
import me.meeshy.sdk.model.PendingTombstone
import me.meeshy.sdk.model.MessageRemoved
import me.meeshy.sdk.model.MessageViewOncePurgedEvent
import me.meeshy.sdk.model.SharedTranslationDeltas
import me.meeshy.sdk.model.translation.SharedTranslation
import me.meeshy.sdk.net.MeeshyApi

/**
 * Applique à Room, SANS appel réseau, les événements du fil qui modifient un message déjà en cache
 * (miroir des écritures `MessagePersistenceActor` déclenchées par `ConversationSocketHandler`, iOS) :
 * suppression, expiration, épingle, échéance servie, masquage personnel, consommation et purge d'une
 * vue unique, réactions d'une pièce, retrait du post cité, accusé de consommation d'une pièce
 * (`attachment-status:updated`), pièce modifiée ou prête (`message:attachment-updated`, `attachment:ready`) et
 * traduction partagée par un membre.
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
    /** Les événements arrivés avant leur message (suppression, expiration) : gardés ici, rejoués par l'ingestion. */
    private val events: MessageEventBuffer? = null,
    /** Le clair E2EE d'un message parti s'inscrit dans la file durable qui vide le coffre (#14633, #14655). */
    private val erasures: PlaintextErasureLedger? = null,
    /** L'index des médias de la conversation : un message retiré ou expiré quitte TOUS les genres. */
    private val mediaIndex: ConversationMediaHubIndex? = null,
) {
    @Inject
    constructor(
        database: MeeshyDatabase,
        messageDao: MessageDao,
        clock: CacheClock,
        fence: me.meeshy.sdk.session.AccountFence?,
        events: MessageEventBuffer,
        erasures: PlaintextErasureLedger,
        mediaIndex: ConversationMediaHubIndex,
    ) : this(database, CachedMessageUpdater(database, messageDao, fence), clock, events, erasures, mediaIndex)

    private val tombstones = MessageTombstoneWriter(updater, null, events, mediaIndex)

    /**
     * Applique [event] s'il est un delta local et rend `true` ; rend `false` pour un événement qui
     * n'est pas un delta de message (le consommateur le traite autrement). [viewerId] est l'utilisateur
     * courant : il départage l'échéance d'un éphémère (expéditeur ou destinataire) et la consommation
     * d'une vue unique (soi ou un autre).
     */
    suspend fun apply(event: ConversationSocketEvent, viewerId: String?): Boolean {
        when (event) {
            is MessageRemoved -> erasing(listOf(event.messageId)) { remove(event) }
            is MessagePinChanged -> transform(event.messageId) { pin(it, event) }
            is MessageCountdownStartedEvent -> transform(event.messageId) { message ->
                ConversationEventDeltas.servedDeadline(message, event.expiresAt, viewerIsSender = message.isFrom(viewerId))
            }
            is MessageHiddenForMeEvent -> event.messages.map { it.messageId }.let { ids -> erasing(ids) { purge(ids) } }
            is MessageConsumedEvent -> consumed(event, viewerId)
            is MessageViewOncePurgedEvent -> erasing(listOf(event.messageId)) {
                transform(event.messageId) { ConversationEventDeltas.viewOncePurged(it) }
            }
            is MessageCitedPostWithdrawnEvent -> withdrawCitedPost(event)
            is AttachmentReactionUpdateEvent -> transform(event.messageId) {
                val mine = viewerId != null && event.userId == viewerId
                ConversationEventDeltas.attachmentReactions(
                    it, event.attachmentId, event.reactionSummary,
                    ownEmoji = event.emoji.takeIf { mine },
                    ownAdding = !event.isRemoval,
                )
            }
            is AttachmentStatusUpdatedEvent -> transform(event.messageId) { AttachmentLiveDeltas.status(it, event, viewerId) }
            is MessageAttachmentUpdatedEvent -> enrich(event.messageId, event.conversationId, event.servedAttachmentId, event.attachment)
            is AttachmentReadyEvent -> readyPiece(event)
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

    /**
     * La traduction qu'un membre a PARTAGÉE (`message:translation-shared`) rejoint les traductions du message en cache :
     * l'enveloppe s'ouvre avec le texte de la ligne ([SharedTranslationDeltas]). [readerLanguages] est le prisme du lecteur
     * (rangs 1 à 4) ; sans message en cache, rien n'est écrit — la prochaine ouverture du fil la lira.
     */
    suspend fun mergeSharedTranslation(shared: SharedTranslation, readerLanguages: List<String>) {
        transform(shared.messageId) { SharedTranslationDeltas.merge(it, shared, readerLanguages) }
    }

    /** Le média prêt d'un MESSAGE (jamais celui d'un post) : même enrichissement que `message:attachment-updated`. */
    private suspend fun readyPiece(event: AttachmentReadyEvent) {
        if (!event.isMessageAttachment) return
        enrich(event.messageId.orEmpty(), event.conversationId.orEmpty(), event.attachmentId, event.servedAttachment(MeeshyApi.json))
    }

    private suspend fun enrich(messageId: String, conversationId: String, attachmentId: String?, piece: ApiMessageAttachment?) {
        if (attachmentId.isNullOrBlank() || piece == null) return
        transform(messageId) { AttachmentLiveDeltas.enriched(it, conversationId, attachmentId, piece) }
    }

    /** Chaque message du fil qui cite le post retiré devient « Story indisponible » (#7969, #13296), en une seule écriture. */
    private suspend fun withdrawCitedPost(event: MessageCitedPostWithdrawnEvent) {
        CitedPostWithdrawn(database, updater).apply(event.conversationId, event.postId)
    }

    private suspend fun transform(messageId: String, delta: (ApiMessage) -> ApiMessage) {
        updater.update(messageId, requireSynced = false, openedAt = clock.nowMillis(), transform = delta)
    }

    /** Une suppression pour tous laisse une pierre tombale ; une expiration retire la ligne. */
    private suspend fun remove(event: MessageRemoved) {
        database.editRevisionDao().deleteForMessage(event.messageId)
        val deletedAt = event.deletedAt ?: nowIso()
        // Une vue unique ouverte garde son enveloppe (« déjà ouverte ») : le serveur la détruit quand tous
        // l'ont ouverte, ce n'est pas une suppression pour qui la voit passer. Un message encore inconnu
        // garde sa pierre tombale, rejouée à l'arrivée de sa ligne ; une expiration retire la ligne.
        if (event.expired) {
            if (!purgeKnown(event.messageId)) {
                events?.rememberTombstone(event.messageId, PendingTombstone(deletedAt, sparingOpenedViewOnce = true, expired = true))
            }
        } else {
            tombstones.markDeleted(event.messageId, deletedAt, sparingOpenedViewOnce = true)
        }
    }

    private suspend fun purgeKnown(messageId: String): Boolean {
        val known = updater.find(messageId) != null
        if (known) purge(listOf(messageId))
        return known
    }

    private fun pin(message: ApiMessage, event: MessagePinChanged): ApiMessage =
        if (event.pinned) {
            ConversationEventDeltas.pinned(message, event.pinnedAt ?: message.pinnedAt ?: nowIso(), event.pinnedBy ?: message.pinnedBy)
        } else {
            ConversationEventDeltas.pinned(message, null, null)
        }

    /**
     * La flamme-œil consommée par CE lecteur (#13995) : le même effet local qu'un `message:expired`
     * servi — la ligne quitte le cache, ses révisions avec elle.
     */
    suspend fun expireLocally(messageIds: List<String>) = erasing(messageIds) { purge(messageIds) }

    /**
     * La vue unique que CE lecteur vient de refermer : son clair E2EE quitte le coffre sans attendre l'écho (#14633), et
     * la ligne Room se scelle comme à un `message:consumed` par soi (contenu, traductions, pièces vidés, #15897).
     */
    suspend fun erasePlaintexts(messageIds: List<String>) = erasing(messageIds) {
        messageIds.forEach { id -> transform(id) { ConversationEventDeltas.sealedAsOpened(it) } }
    }

    /** Une vue unique ouverte par CE lecteur (ici ou sur un autre de ses appareils) : son clair quitte le coffre. */
    private suspend fun consumed(event: MessageConsumedEvent, viewerId: String?) {
        val openedByViewer = viewerId != null && (event.userId == viewerId || event.participantId == viewerId)
        val update: suspend () -> Unit = { transform(event.messageId) { ConversationEventDeltas.consumed(it, event, viewerId) } }
        if (openedByViewer) erasing(listOf(event.messageId), update) else update()
    }

    /**
     * Inscrit l'effacement dans la file durable DANS la transaction de [change], et AVANT lui : une expiration retire la
     * ligne, et avec elle le `cid_` et l'auteur de mon envoi. Le coffre se vide ensuite pour le compte de la session
     * (`EndToEndPlaintextJanitor`), fil ouvert ou non, coffre verrouillé ou non.
     */
    private suspend fun erasing(messageIds: List<String>, change: suspend () -> Unit) {
        val ledger = erasures ?: return change()
        database.withTransaction {
            ledger.recordNamed(messageIds)
            change()
        }
    }

    /** Retire les lignes nommées (par l'une ou l'autre de leurs deux clés) et leurs traductions retenues, en une transaction. */
    private suspend fun purge(messageIds: List<String>) {
        if (messageIds.isEmpty()) return
        val ticket = updater.ticket()
        val known = if (mediaIndex == null) emptyList() else messageIds.mapNotNull { id -> updater.find(id)?.let { it.conversationId to id } }
        database.withTransaction { CachedMessageUpdater.purgeInTransaction(database, messageIds) }
        known.forEach { (conversationId, id) -> mediaIndex?.forgetMessage(conversationId, id, ticket) }
    }

    private fun ApiMessage.isFrom(userId: String?): Boolean =
        userId != null && (senderId ?: sender?.resolvedUserId) == userId

    private fun nowIso(): String = Instant.ofEpochMilli(clock.nowMillis()).toString()
}
