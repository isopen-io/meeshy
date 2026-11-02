package me.meeshy.sdk.search

import me.meeshy.sdk.model.ApiConversation
import me.meeshy.sdk.model.isoToEpochMillis
import me.meeshy.sdk.net.api.UserSearchResult

/**
 * Fusion des resultats locaux (index FTS, caches) et reseau d'un meme volet — parite iOS
 * `mergeUnique*Results`. Le reseau passe en premier : il porte les compteurs, apercus et
 * presences les plus frais, le local comble ce que le serveur n'a pas rendu (hors ligne).
 * Dedoublonnage par id (premiere occurrence gardee) et tri STABLE : un resultat deja affiche
 * ne saute pas quand le reseau repond.
 */
public object SearchResultMerger {

    public fun <T> mergeById(first: List<T>, second: List<T>, id: (T) -> String): List<T> =
        (first + second).distinctBy(id)

    /** Conversations : reseau d'abord, dedup par id, tri par dernier message decroissant (stable). */
    public fun conversations(local: List<ApiConversation>, remote: List<ApiConversation>): List<ApiConversation> =
        mergeById(remote, local) { it.id }.sortedByDescending(::activityOf)

    /** Personnes : reseau d'abord (presence fraiche), le local comble. */
    public fun users(local: List<UserSearchResult>, remote: List<UserSearchResult>): List<UserSearchResult> =
        mergeById(remote, local) { it.id }

    /** Messages : dedup par id, du plus recent au plus ancien. */
    public fun messages(local: List<MessageSearchHit>, remote: List<MessageSearchHit>): List<MessageSearchHit> =
        mergeMessageHits(listOf(remote, local))

    private fun activityOf(conversation: ApiConversation): Long =
        isoToEpochMillis(conversation.lastMessage?.createdAt ?: conversation.updatedAt ?: conversation.createdAt)
}
