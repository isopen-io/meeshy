package me.meeshy.app.stories

/**
 * Le verrou d'une transition de slide : pendant qu'une transition joue, les taps rapides sont ignorés (pas
 * d'animations qui se chevauchent). [tryBegin] rend vrai si l'appelant a obtenu le droit de jouer ; il doit alors
 * appeler [end] quand la transition est terminée (l'horloge de la slide repart à ce moment).
 */
internal class StorySlideTransitionLock {
    var isTransitioning: Boolean = false
        private set

    fun tryBegin(): Boolean {
        if (isTransitioning) return false
        isTransitioning = true
        return true
    }

    fun end() {
        isTransitioning = false
    }
}
