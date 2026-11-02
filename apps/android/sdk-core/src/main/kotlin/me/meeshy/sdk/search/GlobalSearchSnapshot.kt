package me.meeshy.sdk.search

import me.meeshy.sdk.model.ApiConversation
import me.meeshy.sdk.model.search.SearchPane
import me.meeshy.sdk.model.search.SearchPaneKind
import me.meeshy.sdk.model.search.SearchPanes
import me.meeshy.sdk.net.api.UserSearchResult

/**
 * Un instantane de la recherche globale : trois volets, chacun avec son eventuelle panne.
 * [remoteSettled] est faux pour l'instantane LOCAL emis avant la reponse du serveur.
 * [offline] vaut vrai quand la recherche a repondu depuis l'index local seul.
 */
public data class GlobalSearchSnapshot(
    val conversations: SearchPane<ApiConversation> = SearchPane(),
    val users: SearchPane<UserSearchResult> = SearchPane(),
    val messages: SearchPane<MessageSearchHit> = SearchPane(),
    val remoteSettled: Boolean = true,
    val offline: Boolean = false,
) {
    public val results: GlobalSearchResults
        get() = GlobalSearchResults(conversations.items, users.items, messages.items)

    public val firstFailure: SearchPaneKind?
        get() = SearchPanes.firstFailure(conversations, users, messages)

    public val hasDisplayedResults: Boolean
        get() = SearchPanes.hasDisplayedResults(conversations, users, messages)

    public companion object {
        public fun settled(results: GlobalSearchResults): GlobalSearchSnapshot = GlobalSearchSnapshot(
            conversations = SearchPane(results.conversations),
            users = SearchPane(results.users),
            messages = SearchPane(results.messages),
        )
    }
}
