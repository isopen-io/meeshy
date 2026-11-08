package me.meeshy.sdk.model.conversationlist

import me.meeshy.sdk.model.ConversationFilter

/**
 * Composition des filtres de la liste de conversations — port de `ConversationFilterComposition`
 * (apps/ios/Meeshy/Features/Main/Models/ConversationFilterComposition.swift).
 *
 * Types (Personnel, Privée, Ouvertes, Globales, Channels) : OU. États (Non lus, Favoris) : ET.
 * Entre les deux familles : ET. `ALL` est le neutre, `ARCHIVED` change de corpus, l'ensemble vide vaut `ALL`.
 */
public object ConversationFilterComposition {

    public val typeFilters: Set<ConversationFilter> = setOf(
        ConversationFilter.PERSONAL,
        ConversationFilter.PRIVATE,
        ConversationFilter.OPEN,
        ConversationFilter.GLOBAL,
        ConversationFilter.CHANNELS,
    )

    public val stateFilters: Set<ConversationFilter> = setOf(ConversationFilter.UNREAD, ConversationFilter.FAVORITES)

    public val neutral: Set<ConversationFilter> = setOf(ConversationFilter.ALL)

    /** Un appui sur [filter] : il s'ajoute s'il manque, il part s'il est là ; jamais de sélection vide. */
    public fun toggling(filter: ConversationFilter, selection: Set<ConversationFilter>): Set<ConversationFilter> {
        if (filter == ConversationFilter.ALL) return neutral
        val next = selection - ConversationFilter.ALL
        val toggled = if (filter in next) next - filter else next + filter
        return toggled.ifEmpty { neutral }
    }

    public fun isNeutral(selection: Set<ConversationFilter>): Boolean =
        selection.isEmpty() || ConversationFilter.ALL in selection

    public fun includesArchived(selection: Set<ConversationFilter>): Boolean = ConversationFilter.ARCHIVED in selection

    public fun selectedTypes(selection: Set<ConversationFilter>): Set<ConversationFilter> =
        if (isNeutral(selection)) emptySet() else selection.intersect(typeFilters)

    public fun selectedStates(selection: Set<ConversationFilter>): Set<ConversationFilter> =
        if (isNeutral(selection)) emptySet() else selection.intersect(stateFilters)
}
