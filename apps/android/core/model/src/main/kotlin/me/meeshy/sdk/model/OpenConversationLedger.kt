package me.meeshy.sdk.model

/**
 * Le registre des conversations affichées (miroir de `OpenConversationLedger`, iOS) : un comptage par
 * conversation (tablette / pliable : plusieurs fenêtres peuvent afficher la même) et l'ordre d'ouverture,
 * la plus récente en dernier. Valeur immuable : chaque transition rend le registre suivant.
 */
data class OpenConversationLedger(
    val openCounts: Map<String, Int> = emptyMap(),
    val openOrder: List<String> = emptyList(),
) {
    /** La conversation la plus récemment ouverte encore affichée. */
    val activeConversationId: String? get() = openOrder.lastOrNull()

    val openConversationIds: Set<String> get() = openCounts.keys

    fun isOpen(id: String): Boolean = id in openCounts

    /** [Transition.changed] est vrai à la PREMIÈRE ouverture seulement : c'est elle qui rejoint la salle. */
    fun opening(id: String): Transition {
        val count = openCounts[id] ?: 0
        return Transition(
            ledger = OpenConversationLedger(openCounts + (id to count + 1), openOrder.filter { it != id } + id),
            changed = count == 0,
        )
    }

    /** [Transition.changed] est vrai quand c'était la DERNIÈRE fenêtre : seule elle quitte la salle. */
    fun closing(id: String): Transition {
        val count = openCounts[id] ?: return Transition(this, changed = false)
        if (count > 1) return Transition(copy(openCounts = openCounts + (id to count - 1)), changed = false)
        return Transition(OpenConversationLedger(openCounts - id, openOrder.filter { it != id }), changed = true)
    }

    data class Transition(val ledger: OpenConversationLedger, val changed: Boolean)
}
