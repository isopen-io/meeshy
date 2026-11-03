package me.meeshy.sdk.story

import java.io.File
import java.util.UUID
import kotlinx.coroutines.CancellationException
import me.meeshy.sdk.model.StoryComposerDraftSnapshot

/**
 * Les octets d'un média que l'ancien brouillon nomme et que l'appareil détient encore : [copy] les écrit dans [directory]
 * et rend le fichier, `null` quand l'appareil ne les a pas (un média déjà téléversé ne vit que sur le serveur). Une
 * lecture qui échoue LÈVE : la migration s'arrête alors sans rien perdre.
 */
public fun interface LegacyDraftMediaSource {
    public suspend fun copy(mediaId: String, directory: File): File?
}

/**
 * Reprend le brouillon UNIQUE de l'ancien emplacement (DataStore) dans le magasin à brouillons multiples, médias compris.
 *
 * L'ancien emplacement n'est vidé qu'après une copie VÉRIFIÉE : l'instantané relu est identique et chaque média copié est
 * rangé. Toute autre issue (rien à reprendre, un média illisible, une écriture refusée) le laisse intact. Idempotente :
 * le brouillon repris a toujours le même identifiant ([LEGACY_DRAFT_ID]), une reprise interrompue se rejoue sans doublon.
 *
 * Elle VIDE l'ancien emplacement : elle ne se lance qu'une fois que le composer, « Reprendre votre brouillon », Mes
 * stories et [me.meeshy.sdk.publication.PublicationOutbox] lisent [StoryDraftStoring]. Aucun démarrage ne la lance tant
 * qu'un de ces lecteurs dépend de [StoryComposerDraftStore]. Bloque sur le disque : hors du fil principal.
 */
public class LegacyDraftMigrator(
    private val legacy: StoryComposerDraftStore,
    private val store: StoryDraftStoring,
    private val media: LegacyDraftMediaSource,
    private val staging: File,
    private val clock: () -> Long = System::currentTimeMillis,
) {
    /** L'identifiant du brouillon repris, ou `null` quand rien n'a été repris (l'ancien emplacement reste alors tel quel). */
    public suspend fun migrate(): String? {
        val snapshot = legacy.load()?.takeIf { it.isWorthRestoring } ?: return null
        val batch = File(staging, UUID.randomUUID().toString())
        try {
            if (!batch.isDirectory && !batch.mkdirs()) return null
            val files = copyMedia(snapshot, batch) ?: return null
            if (!store.save(LEGACY_DRAFT_ID, snapshot, files)) return null
            if (snapshot.isAwaitingPublication) store.markPendingPublish(LEGACY_DRAFT_ID, clock())
            if (!isFaithfulCopy(snapshot, files.keys)) return null
            legacy.clear()
            return LEGACY_DRAFT_ID
        } finally {
            batch.deleteRecursively()
        }
    }

    private suspend fun copyMedia(snapshot: StoryComposerDraftSnapshot, batch: File): Map<String, File>? {
        val copied = mutableMapOf<String, File>()
        for (mediaId in snapshot.namedMedia()) {
            val file = try {
                media.copy(mediaId, batch)
            } catch (cancelled: CancellationException) {
                throw cancelled
            } catch (_: Exception) {
                return null
            }
            if (file != null) copied[file.name] = file
        }
        return copied
    }

    private fun isFaithfulCopy(snapshot: StoryComposerDraftSnapshot, mediaNames: Set<String>): Boolean =
        store.peek(LEGACY_DRAFT_ID) == snapshot && store.mediaNames(LEGACY_DRAFT_ID).containsAll(mediaNames)

    private fun StoryComposerDraftSnapshot.namedMedia(): List<String> =
        slides.flatMap { slide -> slide.mediaIds + listOfNotNull(slide.backgroundMediaId) + slide.placedMedia.map { it.id } }
            .distinct()

    public companion object {
        public const val LEGACY_DRAFT_ID: String = "legacy-composer-draft"
    }
}
