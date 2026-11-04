package me.meeshy.sdk.mediahub

import me.meeshy.sdk.model.mediahub.ConversationMediaKind

/**
 * Le disque derrière l'index des médias d'une conversation : un index PAR GENRE, servi aussitôt, jamais plafonné,
 * gardé six mois. [None] est la couture inerte (tests, appareils sans disque) : l'index ne vit alors qu'en mémoire.
 */
interface ConversationMediaPersistence {
    /** L'index gardé du genre, ou `null` (jamais vu, ou au-delà de la rétention). */
    suspend fun read(conversationId: String, kind: ConversationMediaKind): MediaHubIndexEntry?

    suspend fun write(conversationId: String, kind: ConversationMediaKind, entry: MediaHubIndexEntry)

    /** Vide TOUS les genres de la conversation (sortie, historique effacé, suppression). */
    suspend fun invalidate(conversationId: String)

    object None : ConversationMediaPersistence {
        override suspend fun read(conversationId: String, kind: ConversationMediaKind): MediaHubIndexEntry? = null
        override suspend fun write(conversationId: String, kind: ConversationMediaKind, entry: MediaHubIndexEntry) = Unit
        override suspend fun invalidate(conversationId: String) = Unit
    }
}
