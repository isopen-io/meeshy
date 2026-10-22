package me.meeshy.sdk.model.accessibility

/**
 * Sens de LECTURE d'un glissement : négatif vers l'« avant » du fil, positif vers
 * l'« arrière », quelle que soit la langue. Identité en LTR. À réserver aux gestes de
 * navigation ; un objet déplacé à la main suit le doigt dans toutes les langues.
 */
public object ReadingDirection {
    public fun readingDelta(translationX: Float, isRtl: Boolean): Float =
        if (isRtl) 0f - translationX else translationX
}
