package me.meeshy.sdk.conversation

import me.meeshy.core.database.MeeshyDatabase
import me.meeshy.core.database.entity.MessageEntity
import me.meeshy.sdk.model.ApiMessage
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

    private const val CHUNK = 400
}
