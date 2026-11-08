package me.meeshy.sdk.conversation

import me.meeshy.core.database.MeeshyDatabase
import me.meeshy.core.database.dao.MessageTranslationDao
import me.meeshy.core.database.entity.MessageAudioTranslationEntity
import me.meeshy.core.database.entity.MessageTranscriptionEntity
import me.meeshy.core.database.entity.MessageTranslationEntity
import me.meeshy.sdk.model.AttachmentAudioMetadata
import me.meeshy.sdk.model.StoredAudioTranslation
import me.meeshy.sdk.model.StoredTextTranslation
import me.meeshy.sdk.model.StoredTranscription
import me.meeshy.sdk.model.TranslationOverlay
import me.meeshy.sdk.session.PerAccountCache

/**
 * Les traductions, transcriptions et pistes audio traduites DÉJÀ REÇUES d'un message, hors de sa charge (miroir de
 * `TranslationCacheRecord` iOS) : Room (trois tables uniques par message et langue) est la source, un L1 borné en est
 * la copie lue au rendu. La projection [project] superpose ces lignes au message décodé, sans que l'écran change.
 *
 * - Les lignes sont rangées sous l'identifiant CANONIQUE du message (le serveur dès qu'il est connu) : le repli
 *   socket horodaté et l'id stable du serveur désignent la même ligne.
 * - Un message protégé ou purgé ([TranslationOverlay.refuses]) n'a jamais de ligne : sa traduction vit dans sa charge.
 * - Toute disparition du message ou de son contenu (purge, pierre tombale, édition) emporte ses lignes dans la même
 *   transaction ([DedicatedTranslationRows]), et le L1 les oublie.
 * - Le L1 est un cache du COMPTE : la fin de session le vide ([clear]), le compte suivant réhydrate depuis le disque.
 * - [ensureLoaded] lit en UNE requête groupée par table les messages qu'une fenêtre affiche et que le L1 ne tient pas.
 * - Un L1 inchangé rend la même instance : aucune republication pour un dictionnaire inchangé.
 */
internal class TranslationLayer(
    private val database: MeeshyDatabase,
    private val dao: MessageTranslationDao,
    private val capacity: Int = L1_CAPACITY,
) : PerAccountCache {
    private class Entry(
        val texts: List<StoredTextTranslation>,
        val transcriptions: List<StoredTranscription>,
        val audio: List<StoredAudioTranslation>,
    )

    private class Projected(val base: LocalMessage, val entry: Entry?, val result: LocalMessage)

    private val l1 = object : LinkedHashMap<String, Entry>(capacity, 0.75f, true) {
        override fun removeEldestEntry(eldest: MutableMap.MutableEntry<String, Entry>): Boolean = size > capacity
    }
    private val projections = HashMap<String, Projected>()
    private var hydrated = false

    /** Charge, en une requête groupée par table, les messages de [ids] que le L1 ne tient pas encore. */
    suspend fun ensureLoaded(ids: Collection<String>) {
        hydrateOnce()
        val missing = synchronized(l1) { ids.filter { it !in l1 }.distinct() }
        if (missing.isEmpty()) return
        load(missing)
    }

    private suspend fun hydrateOnce() {
        val first = synchronized(l1) { (!hydrated).also { hydrated = true } }
        if (first) load(dao.recentTranslatedMessageIds(HYDRATE_RECENT))
    }

    private suspend fun load(ids: List<String>) {
        if (ids.isEmpty()) return
        val texts = ids.chunked(CHUNK).flatMap { dao.textsFor(it) }.groupBy { it.messageId }
        val transcriptions = ids.chunked(CHUNK).flatMap { dao.transcriptionsFor(it) }.groupBy { it.messageId }
        val audio = ids.chunked(CHUNK).flatMap { dao.audioFor(it) }.groupBy { it.messageId }
        synchronized(l1) {
            ids.forEach { id ->
                if (id in l1) return@forEach
                l1[id] = Entry(
                    texts = texts[id].orEmpty().map { it.stored() },
                    transcriptions = transcriptions[id].orEmpty().map { it.stored() },
                    audio = audio[id].orEmpty().map { it.stored() },
                )
            }
        }
    }

    /** Le message superposé aux lignes retenues ; la même instance quand rien ne change. */
    fun project(local: LocalMessage): LocalMessage {
        val id = local.message.id
        val entry = synchronized(l1) { l1[id] }
        val known = synchronized(projections) { projections[id] }
        if (known != null && known.base === local && known.entry === entry) return known.result
        val result = if (entry == null) {
            local
        } else {
            val overlaid = TranslationOverlay.apply(local.message, entry.texts, entry.transcriptions, entry.audio)
            if (overlaid === local.message) local else local.copy(message = overlaid)
        }
        synchronized(projections) {
            projections[id] = Projected(local, entry, result)
            if (projections.size > capacity * 2) projections.keys.retainAll(synchronized(l1) { l1.keys.toSet() })
        }
        return result
    }

    /** Écrit une traduction de texte (remplace celle de la même langue) ; `false` si rien ne change. */
    suspend fun saveText(messageId: String, row: StoredTextTranslation, nowMillis: Long): Boolean {
        val language = row.language.trim().lowercase()
        val held = current(messageId)?.texts?.firstOrNull { it.language.equals(language, true) }
        if (held != null && held.content == row.content) return false
        dao.upsertText(
            MessageTranslationEntity(messageId, language, row.content, row.sourceLanguage, row.model, row.confidence, nowMillis),
        )
        retain(messageId) { entry ->
            val stored = row.copy(messageId = messageId, language = language)
            Entry(entry.texts.filterNot { it.language.equals(language, true) } + stored, entry.transcriptions, entry.audio)
        }
        return true
    }

    suspend fun saveTranscription(messageId: String, row: StoredTranscription, nowMillis: Long): Boolean {
        val held = current(messageId)?.transcriptions?.firstOrNull { it.attachmentId == row.attachmentId }
        if (held == row.copy(messageId = messageId)) return false
        dao.upsertTranscription(
            MessageTranscriptionEntity(messageId, row.attachmentId, row.text, row.language, row.confidence, row.durationMs, nowMillis),
        )
        retain(messageId) { entry ->
            val stored = row.copy(messageId = messageId)
            Entry(entry.texts, entry.transcriptions.filterNot { it.attachmentId == row.attachmentId } + stored, entry.audio)
        }
        return true
    }

    suspend fun saveAudio(messageId: String, row: StoredAudioTranslation, nowMillis: Long): Boolean {
        val language = row.language.trim().lowercase()
        val held = current(messageId)?.audio?.firstOrNull { it.attachmentId == row.attachmentId && it.language.equals(language, true) }
        if (held != null && held.url == row.url && held.transcription == row.transcription) return false
        dao.upsertAudio(
            MessageAudioTranslationEntity(
                messageId, row.attachmentId, language, row.url, row.transcription, row.durationMs, row.format,
                row.cloned, row.quality, row.voiceModelId, row.ttsModel, nowMillis,
            ),
        )
        retain(messageId) { entry ->
            val stored = row.copy(messageId = messageId, language = language)
            Entry(
                entry.texts,
                entry.transcriptions,
                entry.audio.filterNot { it.attachmentId == row.attachmentId && it.language.equals(language, true) } + stored,
            )
        }
        return true
    }

    /**
     * Recopie la transcription et les pistes parlées rangées sous [localId] vers [serverId] ([AttachmentAudioMetadata]
     * dit lesquelles : celles que le serveur n'a pas déjà, l'id de pièce suivant [attachmentIds]). Idempotent : un second
     * appel n'écrit rien. Rend le nombre de lignes écrites.
     */
    suspend fun rekey(localId: String, serverId: String, attachmentIds: Map<String, String>, nowMillis: Long): Int {
        if (localId.isBlank() || serverId.isBlank() || localId == serverId) return 0
        ensureLoaded(listOf(localId, serverId))
        val (local, server) = synchronized(l1) { (l1[localId] ?: return 0) to (l1[serverId] ?: EMPTY) }
        val transcriptions = AttachmentAudioMetadata.rekeyedTranscriptions(local.transcriptions, server.transcriptions, serverId, attachmentIds)
        val audio = AttachmentAudioMetadata.rekeyedAudio(local.audio, server.audio, serverId, attachmentIds)
        transcriptions.forEach { saveTranscription(serverId, it, nowMillis) }
        audio.forEach { saveAudio(serverId, it, nowMillis) }
        return transcriptions.size + audio.size
    }

    /** Le L1 tient pour vides ceux de [ids] qu'il tenait : leurs lignes viennent de quitter le disque. */
    fun forget(ids: Collection<String>) {
        if (ids.isEmpty()) return
        synchronized(l1) { ids.filter { l1.containsKey(it) }.forEach { l1[it] = EMPTY } }
        synchronized(projections) { ids.forEach { projections.remove(it) } }
    }

    /** Le L1 relira [ids] depuis le disque : une partie seulement de leurs lignes vient d'en partir. */
    fun reload(ids: Collection<String>) {
        if (ids.isEmpty()) return
        synchronized(l1) { ids.forEach { l1.remove(it) } }
        synchronized(projections) { ids.forEach { projections.remove(it) } }
    }

    /** Fin de session : rien du compte qui part ne reste en mémoire, et le suivant réhydrate depuis son disque. */
    override suspend fun clear() {
        synchronized(l1) {
            l1.clear()
            hydrated = false
        }
        synchronized(projections) { projections.clear() }
    }

    /** L'entrée du L1, chargée au besoin depuis le disque. */
    private suspend fun current(messageId: String): Entry? {
        ensureLoaded(listOf(messageId))
        return synchronized(l1) { l1[messageId] }
    }

    private suspend fun retain(messageId: String, change: (Entry) -> Entry) {
        val base = current(messageId) ?: EMPTY
        synchronized(l1) { l1[messageId] = change(base) }
    }

    private fun MessageTranslationEntity.stored() = StoredTextTranslation(messageId, language, content, sourceLanguage, model, confidence)

    private fun MessageTranscriptionEntity.stored() = StoredTranscription(messageId, attachmentId, text, language, confidence, durationMs)

    private fun MessageAudioTranslationEntity.stored() = StoredAudioTranslation(
        messageId, attachmentId, language, url, transcription, durationMs, format, cloned, quality, voiceModelId, ttsModel,
    )

    internal fun heldMessageCount(): Int = synchronized(l1) { l1.size }

    companion object {
        private val perDatabase = java.util.WeakHashMap<MeeshyDatabase, TranslationLayer>()

        /** L'unique couche d'une base : l'écrivain, le lecteur de fenêtre et l'invalidation en partagent le L1. */
        fun of(database: MeeshyDatabase): TranslationLayer = synchronized(perDatabase) {
            perDatabase.getOrPut(database) { TranslationLayer(database, database.messageTranslationDao()) }
        }

        const val L1_CAPACITY = 400
        const val HYDRATE_RECENT = 80
        private const val CHUNK = 500
        private val EMPTY = Entry(emptyList(), emptyList(), emptyList())
    }
}
