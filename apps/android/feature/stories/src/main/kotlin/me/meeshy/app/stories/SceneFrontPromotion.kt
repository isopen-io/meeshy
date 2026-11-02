package me.meeshy.app.stories

/**
 * Toucher un objet posé le fait passer au premier plan (#13917, décision porteur du 2026-10-31, R6 de
 * `2026-10-31-un-seul-compositeur-design.md` ; iOS `SceneFrontPromotion`, #13918) : un texte, un média posé, un sticker,
 * un lieu ou une pastille de son touché monte au sommet de l'ordre UNIQUE de la scène ([StorySceneStack]), et y reste. Il
 * n'y a pas d'action « Ordre » : pour envoyer un objet au dernier rang, on touche les autres, du plus profond au plus haut.
 * Le fond et le son d'ambiance ne sont pas sur la pile, et rien ne bouge quand l'objet est déjà au sommet — même
 * instance, donc aucun cran d'historique.
 */
internal object SceneFrontPromotion {

    fun promoted(state: StoryComposerUiState, ref: SceneObjectRef): StoryComposerUiState {
        val deck = state.deck.restacked(ref, StoryZOrder.TO_FRONT)
        return if (deck === state.deck) state else state.copy(deck = deck)
    }
}
