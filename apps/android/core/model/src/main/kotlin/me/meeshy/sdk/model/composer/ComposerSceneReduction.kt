package me.meeshy.sdk.model.composer

/**
 * Quand la scène du compositeur se réduit (#15192, qui précise #14249) : pour le clavier,
 * ou pour une vraie feuille qui monte du bas, et rien d'autre. Les options d'un outil, qu'elles prennent la place du rail
 * ou une bande au bas ([State.bottomPanelOpen]), et une sélection ([State.subject]) se posent par-dessus une scène pleine.
 * Le recadrage non plus ne la réduit pas (#15194).
 */
object ComposerSceneReduction {

    data class State(
        val keyboardUp: Boolean = false,
        val sheetRaised: Boolean = false,
        val bottomPanelOpen: Boolean = false,
        val subject: ComposerSelectionSubject = ComposerSelectionSubject.NONE,
    )

    fun sceneIsReduced(state: State): Boolean = state.keyboardUp || state.sheetRaised
}
