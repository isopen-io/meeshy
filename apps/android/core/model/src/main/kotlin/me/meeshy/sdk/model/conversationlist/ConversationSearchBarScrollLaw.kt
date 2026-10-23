package me.meeshy.sdk.model.conversationlist

/**
 * La barre de recherche flottante suit le SENS du défilement (miroir de
 * `ConversationSearchBarScrollLaw`, iOS #11036) : défiler vers le bas l'escamote,
 * un défilement vers le haut, même partiel, la ramène, près de la tête de liste
 * elle est toujours là. Valeurs en dp, profondeur absolue (0 en tête de liste).
 *
 * `anchor` retient l'extrême atteint dans le sens courant — le point le plus
 * bas tant que la barre est masquée, le plus haut tant qu'elle est là — et une
 * bascule exige [HYSTERESIS] dp depuis cet extrême : un rebond ne clignote pas.
 */
object ConversationSearchBarScrollLaw {
    const val TOP_ZONE: Float = 30f
    const val HYSTERESIS: Float = 12f

    data class State(val hidden: Boolean, val anchor: Float) {
        companion object {
            val Initial = State(hidden = false, anchor = 0f)
        }
    }

    fun next(state: State, depth: Float): State {
        if (depth <= TOP_ZONE) return State(hidden = false, anchor = depth)
        return if (state.hidden) {
            if (state.anchor - depth >= HYSTERESIS) {
                State(hidden = false, anchor = depth)
            } else {
                State(hidden = true, anchor = maxOf(state.anchor, depth))
            }
        } else {
            if (depth - state.anchor >= HYSTERESIS) {
                State(hidden = true, anchor = depth)
            } else {
                State(hidden = false, anchor = minOf(state.anchor, depth))
            }
        }
    }

    /** Variante au décalage signé de la liste (négatif vers le bas), comme iOS. */
    fun nextForOffset(state: State, offset: Float): State = next(state, -offset)

    /** Pendant la saisie la loi est gelée : la barre reste là où elle est. */
    fun advance(state: State, depth: Float, isTyping: Boolean): State =
        if (isTyping) state else next(state, depth)

    fun isVisible(state: State, isTyping: Boolean): Boolean = isTyping || !state.hidden

    /** Le masquage rend le focus (clavier fermé, bande des communautés retirée). */
    fun dropsFocus(previous: State, current: State): Boolean = !previous.hidden && current.hidden
}
