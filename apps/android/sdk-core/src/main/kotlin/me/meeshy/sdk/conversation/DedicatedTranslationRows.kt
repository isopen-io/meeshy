package me.meeshy.sdk.conversation

import me.meeshy.core.database.MeeshyDatabase
import me.meeshy.core.database.entity.MessageEntity
import me.meeshy.sdk.model.ApiMessage
import me.meeshy.sdk.model.ApiMessageAttachment
import me.meeshy.sdk.model.AttachmentAudioMetadata
import me.meeshy.sdk.model.TranslationOverlay

/**
 * Les traductions, transcriptions et pistes audio retenues d'un message partent AVEC lui (miroir de
 * `MessageChildRows.delete`, iOS `MessagePersistenceActor+Retention`) : chaque porte qui retire une ligne de message,
 * vide son contenu ou le rend protégé appelle [drop] DANS sa transaction, par id local ET id serveur.
 */
internal object DedicatedTranslationRows {

    /**
     * `true` quand les lignes retenues de [before] ne disent plus [after] : le message est parti (`null`), son texte a
     * changé (édition, purge de vue unique, pierre tombale), ou il est devenu protégé ([TranslationOverlay.refuses]).
     */
    fun outlived(before: ApiMessage?, after: ApiMessage?): Boolean =
        after == null || (before != null && before.content != after.content) || TranslationOverlay.refuses(after)

    /** Les identifiants sous lesquels une ligne retenue de [row] a pu être rangée. */
    fun keysOf(row: MessageEntity, vararg messages: ApiMessage?): List<String> =
        (listOf(row.id, row.serverId) + messages.flatMap { listOf(it?.id, it?.clientMessageId) })
            .filterNotNull()
            .filter { it.isNotBlank() }
            .distinct()

    /** Efface du disque les trois familles de [ids], puis les oublie du L1. À appeler dans la transaction du retrait. */
    suspend fun drop(database: MeeshyDatabase, ids: Collection<String>) {
        val all = ids.filter { it.isNotBlank() }.distinct()
        if (all.isEmpty()) return
        val dao = database.messageTranslationDao()
        all.chunked(CHUNK).forEach { chunk ->
            dao.deleteTextsFor(chunk)
            dao.deleteTranscriptionsFor(chunk)
            dao.deleteAudioFor(chunk)
        }
        TranslationLayer.of(database).forget(all)
    }

    /**
     * Les langues dont la charge SERVIE a changé de [before] à [after] (nouvelle traduction, retraduction) : la ligne
     * retenue de ces langues est plus ancienne que ce que le serveur vient de servir.
     */
    fun supersededLanguages(before: ApiMessage, after: ApiMessage): Set<String> {
        val held = before.translations.associate { it.targetLanguage.trim().lowercase() to it.translatedContent }
        return after.translations
            .filter { it.translatedContent.isNotBlank() }
            .map { it.targetLanguage.trim().lowercase() to it.translatedContent }
            .filter { (language, content) -> language.isNotEmpty() && held[language] != content }
            .map { it.first }
            .toSet()
    }

    /** Efface les traductions retenues de [languages] pour [ids], dans la transaction de l'écriture de la charge. */
    suspend fun supersede(database: MeeshyDatabase, ids: Collection<String>, languages: Set<String>) {
        val all = ids.filter { it.isNotBlank() }.distinct()
        if (all.isEmpty() || languages.isEmpty()) return
        val dao = database.messageTranslationDao()
        languages.forEach { language -> all.chunked(CHUNK).forEach { dao.deleteTextFor(it, language) } }
        TranslationLayer.of(database).reload(all)
    }

    /**
     * Les transcriptions et pistes parlées dont la charge SERVIE a changé de [before] à [after] : la ligne retenue (une
     * trame socket) est plus ancienne que ce que le serveur vient de servir (re-transcription, nouvelle voix).
     */
    fun supersededAttachments(before: ApiMessage, after: ApiMessage): SupersededAttachments =
        SupersededAttachments(
            transcriptions = AttachmentAudioMetadata.supersededTranscriptions(before, after),
            audio = AttachmentAudioMetadata.supersededAudio(before, after),
        )

    class SupersededAttachments(val transcriptions: Set<String>, val audio: Set<Pair<String, String>>) {
        val isEmpty: Boolean get() = transcriptions.isEmpty() && audio.isEmpty()
    }

    /** Efface les transcriptions et pistes retenues de [superseded] pour [ids], dans la transaction de l'écriture de la charge. */
    suspend fun supersedeAttachments(database: MeeshyDatabase, ids: Collection<String>, superseded: SupersededAttachments) {
        val all = ids.filter { it.isNotBlank() }.distinct()
        if (all.isEmpty() || superseded.isEmpty) return
        val dao = database.messageTranslationDao()
        if (superseded.transcriptions.isNotEmpty()) {
            all.chunked(CHUNK).forEach { dao.deleteTranscriptionsOf(it, superseded.transcriptions.toList()) }
        }
        superseded.audio.forEach { (attachmentId, language) ->
            all.chunked(CHUNK).forEach { dao.deleteAudioTrackOf(it, attachmentId, language) }
        }
        TranslationLayer.of(database).reload(all)
    }

    /**
     * À l'accusé d'un envoi, ce que l'id LOCAL [localId] a retenu (transcription, pistes parlées) passe sous l'id du
     * message [served], avant que la bulle optimiste ne parte avec ses lignes. Un message protégé n'en reçoit jamais
     * ([TranslationOverlay.refuses]) ; une ligne que le serveur a déjà fait arriver n'est jamais écrasée ; un second
     * accusé n'écrit rien.
     */
    suspend fun rekey(
        database: MeeshyDatabase,
        localId: String,
        served: ApiMessage,
        localAttachments: List<ApiMessageAttachment>,
        nowMillis: Long,
    ) {
        if (localId == served.id || TranslationOverlay.refuses(served)) return
        val attachmentIds = AttachmentAudioMetadata.attachmentIdMap(localAttachments, served.attachments)
        TranslationLayer.of(database).rekey(localId, served.id, attachmentIds, nowMillis)
    }

    private const val CHUNK = 400
}
