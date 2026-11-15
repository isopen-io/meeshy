package me.meeshy.sdk.media

import me.meeshy.sdk.outbox.OutboxRepository
import javax.inject.Inject

/**
 * Plus aucun octet de média en BLOB (#14710) : au démarrage, chaque ligne `media_blob` écrite avant les fichiers scellés
 * voit ses octets déplacés dans leur fichier (lus par tranches de 1 Mo, jamais d'un bloc), puis sa colonne vidée. Le
 * fichier est lié au compte de la ligne d'outbox qui nomme l'envoi ; une ligne dont l'envoi n'existe plus est supprimée.
 * Un envoi en file n'est jamais perdu : tant que la colonne n'est pas vidée, la ligne reste livrable depuis le BLOB.
 */
public class MediaBlobMigrator @Inject constructor(
    private val blobs: MediaBlobStore,
    private val outbox: OutboxRepository,
) {
    public suspend fun migrate(): Int = blobs.migrateLegacy { cmid ->
        outbox.row(cmid)?.let { MediaBlobStore.OwnerLookup.Owned(it.ownerId) } ?: MediaBlobStore.OwnerLookup.Gone
    }
}
