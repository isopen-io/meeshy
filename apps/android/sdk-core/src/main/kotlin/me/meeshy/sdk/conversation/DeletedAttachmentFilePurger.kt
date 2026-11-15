package me.meeshy.sdk.conversation

/**
 * Efface des caches disque de l'appareil les fichiers d'une pièce jointe supprimée (`attachment:deleted`), désignés par
 * leur URL : la clé de chacun de ces caches. Les caches sont ceux du compte courant ; l'appelant ne l'invoque que sous
 * le compte auquel l'événement est arrivé. Idempotent : une URL absente n'est pas une erreur.
 */
interface DeletedAttachmentFilePurger {
    suspend fun purge(urls: Set<String>)

    object None : DeletedAttachmentFilePurger {
        override suspend fun purge(urls: Set<String>) = Unit
    }
}
