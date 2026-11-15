package me.meeshy.sdk.model.search

import me.meeshy.sdk.model.ApiMessage
import me.meeshy.sdk.model.MessageEncryptionGuard

/** Ce qui a fait correspondre un message : son contenu d'origine, ou l'une de ses traductions. */
enum class SearchMatchType { CONTENT, TRANSLATION }

/**
 * Un résultat de la recherche serveur dans une conversation — miroir d'iOS `SearchResultItem`.
 * [matchedText] est le texte qui correspond (le contenu, ou la traduction signalée par
 * [SearchMatchType.TRANSLATION]) ; [content] reste le contenu d'origine du message.
 */
data class ConversationSearchResult(
    val id: String,
    val conversationId: String,
    val content: String,
    val matchedText: String,
    val matchType: SearchMatchType,
    val senderName: String,
    val senderAvatar: String?,
    val createdAtIso: String?,
    /** Flouté (#16957) : la ligne se voile, [content] et [matchedText] sont vides. */
    val isVeiled: Boolean = false,
)

object ConversationSearchResults {

    /** La requête doit compter au moins deux caractères une fois rognée (iOS `ConversationSearchHandler`). */
    const val MIN_QUERY_LENGTH = 2

    /** Les résultats demandés par page. */
    const val PAGE_SIZE = 20

    /** La requête rognée, ou `null` quand elle est trop courte pour interroger le serveur. */
    fun searchable(query: String): String? = query.trim().takeIf { it.length >= MIN_QUERY_LENGTH }

    /**
     * Le contenu est testé d'abord (c'est ce que la bulle rend), puis chaque traduction. Un hit que
     * le serveur renvoie sans correspondance visible garde le contenu intact. Un message flouté
     * ne garde aucun texte : sa ligne se voile.
     */
    fun from(message: ApiMessage, query: String): ConversationSearchResult {
        if (MessageEncryptionGuard.isVeiled(message)) return veiled(message)
        val needle = query.trim().lowercase()
        val sender = message.sender
        val contentMatches = message.content.lowercase().contains(needle)
        val translated = message.translations
            .takeIf { needle.isNotEmpty() && !contentMatches }
            ?.firstOrNull { it.translatedContent.lowercase().contains(needle) }
        return ConversationSearchResult(
            id = message.id,
            conversationId = message.conversationId,
            content = message.content,
            matchedText = translated?.translatedContent ?: message.content,
            matchType = if (translated != null) SearchMatchType.TRANSLATION else SearchMatchType.CONTENT,
            senderName = senderNameOf(message),
            senderAvatar = sender?.avatar,
            createdAtIso = message.createdAt,
        )
    }

    private fun veiled(message: ApiMessage): ConversationSearchResult = ConversationSearchResult(
        id = message.id,
        conversationId = message.conversationId,
        content = "",
        matchedText = "",
        matchType = SearchMatchType.CONTENT,
        senderName = senderNameOf(message),
        senderAvatar = message.sender?.avatar,
        createdAtIso = message.createdAt,
        isVeiled = true,
    )

    private fun senderNameOf(message: ApiMessage): String =
        message.sender?.displayName?.takeIf { it.isNotBlank() } ?: message.sender?.username?.takeIf { it.isNotBlank() } ?: "?"

    /** Fusion sans doublon : les ids locaux gardent leur ordre d'affichage, le serveur ajoute le reste. */
    fun mergeIds(local: List<String>, server: List<String>): List<String> = (local + server).distinct()
}
