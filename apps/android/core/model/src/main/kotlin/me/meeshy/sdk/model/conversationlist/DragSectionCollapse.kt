package me.meeshy.sdk.model.conversationlist

/**
 * Le repli des sections pendant le glissement d'une conversation (iOS `collapseForConversationDrag` /
 * `endConversationDrag`) : le premier survol sauvegarde l'ensemble déplié, replie tout et marque la
 * catégorie d'origine ; la fin restaure l'ensemble sauvegardé, plus ce qui a été déplié pendant, plus
 * la cible. Sans persistance : le repli du glissement n'est pas un choix de l'utilisateur.
 */
object DragSectionCollapse {

    data class State(val saved: Set<String>?, val origin: String?) {
        val isActive: Boolean get() = saved != null
    }

    data class Step(val state: State, val expanded: Set<String>)

    val Idle: State = State(saved = null, origin = null)

    fun begin(state: State, expanded: Set<String>, origin: String?): Step {
        if (state.isActive) return Step(state, expanded)
        return Step(State(saved = expanded, origin = origin), emptySet())
    }

    fun end(state: State, expanded: Set<String>, target: String?): Step {
        val saved = state.saved ?: return Step(Idle, expanded)
        val restored = saved + expanded + listOfNotNull(target?.takeIf { it.isNotEmpty() })
        return Step(Idle, restored)
    }
}
