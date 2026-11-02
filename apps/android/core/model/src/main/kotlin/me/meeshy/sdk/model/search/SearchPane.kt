package me.meeshy.sdk.model.search

/** Les trois volets de la recherche globale, dans l'ordre de priorite des erreurs (parite iOS). */
public enum class SearchPaneKind { CONVERSATIONS, PEOPLE, MESSAGES }

/** Pourquoi un volet n'a rien servi : une panne n'est JAMAIS un « aucun resultat ». */
public sealed interface SearchPaneFailure {
    /** Le reseau n'a pas repondu pour ce volet. */
    public data object Unreachable : SearchPaneFailure
}

/** Un volet rend `{items, failure?}` (parite iOS `GlobalSearchLeg`). */
public data class SearchPane<T>(
    val items: List<T> = emptyList(),
    val failure: SearchPaneFailure? = null,
) {
    public val isFailed: Boolean get() = failure != null
}

public object SearchPanes {

    /** Le premier volet en echec selon la priorite conversations, personnes, messages. */
    public fun firstFailure(
        conversations: SearchPane<*>,
        people: SearchPane<*>,
        messages: SearchPane<*>,
    ): SearchPaneKind? = when {
        conversations.isFailed -> SearchPaneKind.CONVERSATIONS
        people.isFailed -> SearchPaneKind.PEOPLE
        messages.isFailed -> SearchPaneKind.MESSAGES
        else -> null
    }

    /** Vrai des qu'une famille affiche quelque chose. */
    public fun hasDisplayedResults(
        conversations: SearchPane<*>,
        people: SearchPane<*>,
        messages: SearchPane<*>,
    ): Boolean = conversations.items.isNotEmpty() || people.items.isNotEmpty() || messages.items.isNotEmpty()
}

/** Ce que l'ecran rend A LA PLACE de la liste (parite iOS `LoadState`). */
public enum class SearchLoadState { IDLE, LOADING, CACHED_STALE, LOADED, OFFLINE, ERROR }

public object SearchLoadStates {

    /** `LOADING` est reserve au demarrage a froid : un spinner ne remplace jamais des resultats. */
    public fun starting(hasCachedHit: Boolean, hasDisplayedResults: Boolean): SearchLoadState =
        if (hasCachedHit || hasDisplayedResults) SearchLoadState.CACHED_STALE else SearchLoadState.LOADING

    public fun settled(offline: Boolean, failure: SearchPaneKind?, hasDisplayedResults: Boolean): SearchLoadState = when {
        offline -> SearchLoadState.OFFLINE
        failure != null && !hasDisplayedResults -> SearchLoadState.ERROR
        else -> SearchLoadState.LOADED
    }
}
