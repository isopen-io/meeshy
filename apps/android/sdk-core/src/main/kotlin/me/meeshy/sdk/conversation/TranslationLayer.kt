package me.meeshy.sdk.conversation

import androidx.room.withTransaction
import me.meeshy.core.database.MeeshyDatabase
import me.meeshy.core.database.dao.MessageTranslationDao
import me.meeshy.core.database.entity.MessageAudioTranslationEntity
import me.meeshy.core.database.entity.MessageTranscriptionEntity
import me.meeshy.core.database.entity.MessageTranslationEntity
import me.meeshy.sdk.model.StoredAudioTranslation
import me.meeshy.sdk.model.StoredTextTranslation
import me.meeshy.sdk.model.StoredTranscription
import me.meeshy.sdk.model.TranslationOverlay

/**
 * Les traductions, transcriptions et pistes audio traduites DÉJÀ REÇUES d'un message, hors de sa charge (miroir de
 * `TranslationCacheRecord` iOS) : Room (trois tables uniques par message et langue) est la source, un L1 borné en est
 * la copie lue au rendu. La projection [project] superpose ces lignes au message décodé, sans que l'écran change.
 *
 * - Les lignes sont rangées sous l'identifiant CANONIQUE du message (le serveur dès qu'il est connu) : le repli
 *   socket horodaté et l'id stable du serveur désignent la même ligne.
 * - Une langue hors [prism] est écrite sur disque mais jamais retenue en mémoire ni projetée.
 * - [ensureLoaded] lit en UNE requête groupée par table les messages qu'une fenêtre affiche et que le L1 ne tient pas.
 * - Un L1 inchangé rend la même instance : aucune republication pour un dictionnaire inchangé.
 */
internal class TranslationLayer(
    private val database: MeeshyDatabase,
    private val dao: MessageTranslationDao,
    private val capacity: Int = L1_CAPACITY,
) {
    private class Entry(
        val texts: List<StoredTextTranslation>,
        val transcriptions: List<StoredTranscription>,
        val audio: List<StoredAudioTranslation>,
    )

    private class Projected(val base: LocalMessage, val entry: Entry?, val prism: List<String>?, val result: LocalMessage)

    @Volatile
    var prism: List<String>? = null

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
        val admitting = prism
        synchronized(l1) {
            ids.forEach { id ->
                if (id in l1) return@forEach
                l1[id] = Entry(
                    texts = texts[id].orEmpty().filter { admits(admitting, it.language) }.map { it.stored() },
                    transcriptions = transcriptions[id].orEmpty().map { it.stored() },
                    audio = audio[id].orEmpty().filter { admits(admitting, it.language) }.map { it.stored() },
                )
            }
        }
    }

    /** Le message superposé aux lignes retenues ; la même instance quand rien ne change. */
    fun project(local: LocalMessage): LocalMessage {
        val id = local.message.id
        val entry = synchronized(l1) { l1[id] }
        val admitting = prism
        val known = synchronized(projections) { projections[id] }
        if (known != null && known.base === local && known.entry === entry && known.prism == admitting) return known.result
        val result = if (entry == null) {
            local
        } else {
            val overlaid = TranslationOverlay.apply(local.message, entry.texts, entry.transcriptions, entry.audio, admitting)
            if (overlaid === local.message) local else local.copy(message = overlaid)
        }
        synchronized(projections) {
            projections[id] = Projected(local, entry, admitting, result)
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
            if (!admits(prism, language)) return@retain entry
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
            if (!admits(prism, language)) return@retain entry
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
     * Les trois familles de [ids] disparaissent du disque et du L1 : le contenu a changé (édition) ou le message est
     * parti. [ids] porte l'id local ET l'id serveur — chacun désigne la même ligne.
     */
    suspend fun invalidate(ids: Collection<String>) {
        val all = ids.filter { it.isNotBlank() }.distinct()
        if (all.isEmpty()) return
        database.withTransaction {
            dao.deleteTextsFor(all)
            dao.deleteTranscriptionsFor(all)
            dao.deleteAudioFor(all)
        }
        synchronized(l1) { all.forEach { l1[it] = EMPTY } }
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

    private fun admits(prism: List<String>?, language: String): Boolean =
        prism == null || prism.any { it.trim().equals(language.trim(), ignoreCase = true) }

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
