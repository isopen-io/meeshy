package me.meeshy.sdk.conversation

import androidx.room.withTransaction
import me.meeshy.core.database.MeeshyDatabase
import me.meeshy.core.database.dao.sameStoredContentAs
import me.meeshy.core.database.entity.MessageEntity
import me.meeshy.sdk.e2ee.PlaintextErasureLedger
import me.meeshy.sdk.model.ApiMessage
import me.meeshy.sdk.model.ApiMessageAttachment
import me.meeshy.sdk.model.ConversationEventDeltas
import me.meeshy.sdk.model.MessageMergePolicy
import me.meeshy.sdk.model.PendingMessageMutations
import me.meeshy.sdk.model.ReplyReferenceBuilder
import me.meeshy.sdk.model.PendingRowEventReplay
import me.meeshy.sdk.model.isoToEpochMillisOrNull
import me.meeshy.sdk.net.MeeshyApi

/**
 * L'unique porte d'écriture d'un message SERVI (REST, socket, notification) dans Room — miroir de
 * `APIMessageUpsert.upsertBatch` (iOS).
 *
 * Pour chaque message : la ligne existante est retrouvée (identifiant serveur, colonne `serverId`,
 * bulle optimiste par `clientMessageId`), fusionnée champ par champ ([MessageMergePolicy], sous la
 * garde de l'outbox [PendingOutboxGuard]), puis écrite SEULEMENT si ce qu'elle stocke change. Un
 * message reçu trois fois (REST, socket, FCM) donne donc une ligne, et la deuxième et la troisième
 * réception ne réveillent aucun observateur Room : le fil ne recompose pas.
 *
 * Les colonnes locales (tentatives d'envoi, dernière erreur, vue unique ouverte) survivent ; une
 * bulle optimiste que le serveur reconnaît est remplacée par sa jumelle serveur dans la même
 * transaction, sans clignotement, et le pont `cid_ → id serveur` est posé.
 */
internal class MessageIngestPipeline(
    private val database: MeeshyDatabase,
    private val outboxGuard: PendingOutboxGuard = PendingOutboxGuard(database.outboxDao()),
    /** #13792 — le registre des régimes, nourri par chaque message servi ; absent dans les seuls témoins qui ne le lisent pas. */
    private val regime: EndToEndRegimeKeeper? = null,
    /** Les événements arrivés avant leur message : rejoués ici, à l'arrivée de la ligne (édition, réactions, suppression). */
    private val events: MessageEventBuffer? = null,
    /** #14655 — un message chiffré que le serveur dit parti (supprimé, échu, vue unique ouverte) inscrit son effacement. */
    private val erasures: PlaintextErasureLedger? = null,
    /** #16012 — les fichiers locaux d'une ligne réécrite avec ses adresses servies : adoptés, puis libérés. */
    private val media: AcknowledgedBubbleMedia? = null,
) {

    /** Fusionne [messages] dans sa propre transaction ; rend les conversations réellement écrites. */
    suspend fun ingest(messages: List<ApiMessage>, nowMillis: Long): Set<String> {
        if (messages.isEmpty()) return emptySet()
        val settlements = media?.let { mutableListOf<LocalFilesSettlement>() }
        val changed = database.withTransaction { mergeInTransaction(messages, nowMillis, settlements = settlements) }
        settlements?.forEach { media?.settle(it.previous, it.written) }
        return changed
    }

    /** Les pièces `file://` d'une ligne réécrite ([previous]) et celles de la ligne qui la remplace ([written]). */
    internal class LocalFilesSettlement(val previous: List<ApiMessageAttachment>, val written: List<ApiMessageAttachment>)

    /**
     * Fusionne [messages] — À APPELER dans la transaction de l'appelant (une page REST et son
     * élagage ne font qu'une écriture). [conversationId] range la page sous la conversation
     * synchronisée ; `null` garde celle de chaque message. Rend les conversations écrites.
     *
     * Lève [PendingOutboxReadException] quand l'outbox est illisible : la transaction est alors
     * abandonnée plutôt que d'écraser une mutation en attente.
     */
    suspend fun mergeInTransaction(
        messages: List<ApiMessage>,
        nowMillis: Long,
        conversationId: String? = null,
        settlements: MutableList<LocalFilesSettlement>? = null,
    ): Set<String> {
        if (messages.isEmpty()) return emptySet()
        val pending = outboxGuard.load()
        val messageDao = database.messageDao()
        val writes = LinkedHashMap<String, MessageEntity>()
        val replacedLocalIds = mutableSetOf<String>()
        val replacements = mutableListOf<Pair<MessageEntity, ApiMessage>>()
        val changed = mutableSetOf<String>()
        val rowIdOfMessage = HashMap<String, String>()
        val baseOfRow = HashMap<String, MessageEntity>()
        val latest = latestPerId(messages)
        for (served in latest) {
            val filedUnder = conversationId ?: served.conversationId
            val direct = messageDao.find(served.id) ?: messageDao.findByServerId(served.id)
            val optimistic = served.clientMessageId
                ?.takeIf { it != served.id }
                ?.let { messageDao.find(it) }
            val base = direct ?: optimistic
            // La citation se grave à la PREMIÈRE ingestion : un écho allégé ne dégrade jamais une citation riche déjà gravée.
            // Une vue unique déjà ouverte par ce lecteur entre scellée, même à sa première ingestion (#15897).
            val incoming = if (base == null) sealedIfOpened(ReplyReferenceBuilder.engrave(served), openedHere = false) else served
            val fresh = MessageEntityFactory.cached(incoming, cachedAt = nowMillis, conversationId = filedUnder)
            val row = if (base == null) fresh else merged(base, incoming, fresh, pending)
            rowIdOfMessage[incoming.id] = row.id
            if (base != null) baseOfRow[row.id] = base
            listOfNotNull(direct, optimistic).filter { it.id != row.id }.forEach {
                replacedLocalIds += it.id
                replacements += it to incoming
            }
            if (settlements != null) listOfNotNull(direct, optimistic).distinct().forEach { settlements += settlementOf(it, row) }
            val unchanged = base != null && base.id == row.id && row.sameStoredContentAs(base)
            if (!unchanged) {
                writes[row.id] = row
                changed += filedUnder
            }
            incoming.clientMessageId?.let { localId ->
                MessageIdReconciliation.recordAck(database, localId, incoming.id, filedUnder, nowMillis)
            }
        }
        events?.let { replayPendingEvents(it, latest, rowIdOfMessage, writes, replacedLocalIds, nowMillis) }
        replacedLocalIds -= writes.keys
        // La jumelle serveur s'écrit AVANT le retrait de la bulle optimiste : la cascade des traductions retenues
        // (RetainedTranslationCascade) épargne alors les lignes rangées sous l'id serveur, que la jumelle porte déjà.
        if (writes.isNotEmpty()) messageDao.upsertAll(writes.values.toList())
        if (replacedLocalIds.isNotEmpty()) {
            rekeyRetained(replacements.filter { (local, _) -> local.id in replacedLocalIds }, nowMillis)
            messageDao.deleteByIds(replacedLocalIds.toList())
        }
        val retained = retainedChanges(writes.values, baseOfRow)
        DedicatedTranslationRows.drop(database, retained.outlived + replacedLocalIds)
        retained.superseded.forEach { (keys, languages) -> DedicatedTranslationRows.supersede(database, keys, languages) }
        retained.supersededAttachments.forEach { (keys, changes) -> DedicatedTranslationRows.supersedeAttachments(database, keys, changes) }
        regime?.learnFromServed(latest, conversationId)
        erasures?.recordServedGone(latest)
        return changed
    }

    /**
     * Rejoue sur les lignes qui viennent d'être fusionnées ce qui leur est arrivé avant elles : la
     * modification, les réactions, puis la suppression, qui l'emporte (`PendingRowEventReplay`). Une mort
     * par expiration retire la ligne au lieu de l'écrire.
     */
    private fun replayPendingEvents(
        buffer: MessageEventBuffer,
        incoming: Collection<ApiMessage>,
        rowIdOfMessage: Map<String, String>,
        writes: MutableMap<String, MessageEntity>,
        removed: MutableSet<String>,
        nowMillis: Long,
    ) {
        for (message in incoming) {
            val rowId = rowIdOfMessage[message.id] ?: continue
            val row = writes[rowId] ?: continue
            val waiting = buffer.take(listOfNotNull(message.id, message.clientMessageId, rowId)) ?: continue
            val current = runCatching { MeeshyApi.json.decodeFromString<ApiMessage>(row.payload) }.getOrNull() ?: continue
            // Le rejeu (une modification, surtout) ne remet jamais de clair dans une vue unique scellée (#15897).
            val replayed = PendingRowEventReplay.apply(current, waiting).message?.let { sealedIfOpened(it, row.viewOnceOpenedAt != null) }
            if (replayed == null) {
                writes.remove(rowId)
                removed += rowId
            } else if (replayed != current) {
                writes[rowId] = MessageEntityFactory.refreshed(row, replayed).copy(changeVersion = row.changeVersion + 1, cachedAt = nowMillis)
            }
        }
    }

    /**
     * La ligne [base] après fusion de [incoming] : payload et colonnes dérivées recalculés depuis
     * le message fusionné, colonnes locales gardées. Une bulle optimiste (autre clé primaire)
     * devient la ligne serveur : seul l'état « vue unique ouverte » la suit, ses tentatives d'envoi
     * appartenaient à l'envoi désormais acquitté.
     */
    private fun merged(
        base: MessageEntity,
        incoming: ApiMessage,
        fresh: MessageEntity,
        pending: PendingMessageMutations,
    ): MessageEntity {
        val openedHere = base.viewOnceOpenedAt != null
        val cached = runCatching { MeeshyApi.json.decodeFromString<ApiMessage>(base.payload) }.getOrNull()
            ?: return MessageEntityFactory.refreshed(fresh, sealedIfOpened(incoming, openedHere)).copy(
                viewOnceOpenedAt = base.viewOnceOpenedAt ?: fresh.viewOnceOpenedAt,
                changeVersion = base.changeVersion + 1,
            )
        val outcome = MessageMergePolicy.merge(cached, incoming, pending.guardsFor(incoming.id))
        val sameRow = base.id == fresh.id
        val rebuilt = MessageEntityFactory.refreshed(fresh, sealedIfOpened(outcome.message, openedHere)).copy(
            createdAt = isoToEpochMillisOrNull(outcome.message.createdAt) ?: base.createdAt,
            seq = fresh.seq ?: base.seq,
            viewOnceOpenedAt = base.viewOnceOpenedAt ?: fresh.viewOnceOpenedAt,
            changeVersion = base.changeVersion + 1,
        )
        return if (sameRow) {
            rebuilt.copy(retryCount = base.retryCount, lastError = base.lastError, sendState = base.sendState)
        } else {
            rebuilt
        }
    }

    /**
     * Une vue unique que CE lecteur a ouverte — la ligne le sait ([openedHere], colonne `viewOnceOpenedAt`, posée avant
     * que l'outbox n'ait prévenu le serveur) ou la charge le dit (`consumedByMe`) — sort scellée : rien de ce qu'une page
     * servie porte encore ne revient en Room (iso iOS `APIMessageUpsert+Merge`, #15897).
     */
    private fun sealedIfOpened(message: ApiMessage, openedHere: Boolean): ApiMessage =
        ConversationEventDeltas.sealedIfOpened(message, openedHere)

    /** Ce qu'une page servie change aux traductions retenues : des messages entiers, ou certaines langues seulement. */
    private class RetainedChanges(
        val outlived: List<String>,
        val superseded: List<Pair<List<String>, Set<String>>>,
        val supersededAttachments: List<Pair<List<String>, DedicatedTranslationRows.SupersededAttachments>> = emptyList(),
    )

    /** Ce que la bulle optimiste avait retenu (transcription, voix) suit le message sous son id serveur, avant qu'elle ne parte. */
    private suspend fun rekeyRetained(replacements: List<Pair<MessageEntity, ApiMessage>>, nowMillis: Long) {
        replacements.forEach { (local, served) ->
            val attachments = runCatching { MeeshyApi.json.decodeFromString<ApiMessage>(local.payload).attachments }.getOrDefault(emptyList())
            DedicatedTranslationRows.rekey(database, local.id, served, attachments, nowMillis)
        }
    }

    /**
     * Les traductions retenues qu'une page servie rend caduques. Toutes celles d'un message dont le texte a changé
     * (la ligne disait « RDV 14h », la page sert « RDV 16h »), devenu pierre tombale, protégé ou purgé ; une charge
     * illisible est tenue pour caduque (fail-closed). Sinon, celles des langues dont la page sert une traduction
     * NOUVELLE (retraduction, ou traduction du texte courant après une trame socket en retard) : la page est alors
     * plus récente que la ligne, qui lui cède.
     */
    private fun retainedChanges(written: Collection<MessageEntity>, baseOfRow: Map<String, MessageEntity>): RetainedChanges {
        val outlived = mutableListOf<String>()
        val superseded = mutableListOf<Pair<List<String>, Set<String>>>()
        val supersededAttachments = mutableListOf<Pair<List<String>, DedicatedTranslationRows.SupersededAttachments>>()
        written.forEach { row ->
            val base = baseOfRow[row.id] ?: return@forEach
            val before = runCatching { MeeshyApi.json.decodeFromString<ApiMessage>(base.payload) }.getOrNull()
            val after = runCatching { MeeshyApi.json.decodeFromString<ApiMessage>(row.payload) }.getOrNull()
            val keys = DedicatedTranslationRows.keysOf(base, before) + DedicatedTranslationRows.keysOf(row, after)
            if (before == null || after == null || DedicatedTranslationRows.outlived(before, after)) {
                outlived += keys
                return@forEach
            }
            val languages = DedicatedTranslationRows.supersededLanguages(before, after)
            if (languages.isNotEmpty()) superseded += keys to languages
            val attachments = DedicatedTranslationRows.supersededAttachments(before, after)
            if (!attachments.isEmpty) supersededAttachments += keys to attachments
        }
        return RetainedChanges(outlived, superseded, supersededAttachments)
    }

    /**
     * #16012 — une ligne qui nommait des fichiers de l'appareil (bulle optimiste, ou bulle que l'accusé socket a seulement
     * renommée) et que [row] réécrit : ses pièces et celles de [row], à régler APRÈS l'écriture. Rien sans fichier local.
     */
    private fun settlementOf(previous: MessageEntity, row: MessageEntity): List<LocalFilesSettlement> {
        if (!AcknowledgedBubbleMedia.mayHoldLocalFiles(previous.payload)) return emptyList()
        val before = runCatching { MeeshyApi.json.decodeFromString<ApiMessage>(previous.payload).attachments }.getOrNull().orEmpty()
        if (before.isEmpty()) return emptyList()
        val after = runCatching { MeeshyApi.json.decodeFromString<ApiMessage>(row.payload).attachments }.getOrNull().orEmpty()
        return listOf(LocalFilesSettlement(before, after))
    }

    /** Une rafale peut porter deux fois le même message : seul son dernier état compte. */
    private fun latestPerId(messages: List<ApiMessage>): Collection<ApiMessage> {
        val latest = LinkedHashMap<String, ApiMessage>()
        messages.forEach { message ->
            latest.remove(message.id)
            latest[message.id] = message
        }
        return latest.values
    }
}
