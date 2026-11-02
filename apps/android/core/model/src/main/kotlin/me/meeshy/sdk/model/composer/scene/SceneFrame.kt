package me.meeshy.sdk.model.composer.scene

import me.meeshy.sdk.model.StoryBackgroundTransform
import me.meeshy.sdk.model.StoryTransitionEffect

/**
 * Ce que l'auteur règle sur le cadre d'une slide, hors pan/zoom : le [fitMode] du fond média (« fit » / « fill », `null` =
 * jamais choisi, rendu REMPLI), le [backdrop] des bandes d'un média ajusté et les transitions [opening] / [closing]. Les
 * deux premiers voyagent dans `effects.backgroundTransform` (contrat commun avec iOS et le web), les deux autres dans
 * `effects.opening` / `effects.closing`.
 */
public data class SceneFrame(
    val fitMode: String? = null,
    val backdrop: String? = null,
    val opening: StoryTransitionEffect? = null,
    val closing: StoryTransitionEffect? = null,
) {
    public val isNeutral: Boolean get() = fitMode == null && backdrop == null && opening == null && closing == null

    public fun withFitMode(mode: String): SceneFrame = copy(fitMode = mode)

    /** Choisir un fond AJUSTE la scène : rempli, le média n'a aucune bande où le laisser voir. */
    public fun withBackdrop(value: StoryBackdrop): SceneFrame = copy(backdrop = value.wire, fitMode = StoryFitMode.FIT)

    public fun applying(choice: SceneEffectChoice): SceneFrame = when (choice) {
        is SceneEffectChoice.Opening -> copy(opening = choice.effect)
        is SceneEffectChoice.Closing -> copy(closing = choice.effect)
        is SceneEffectChoice.Visual -> this
    }

    public fun transitions(): SceneTransitions = SceneTransitions(opening, closing)

    /** Le transform écrit sur le fil, `null` quand l'auteur n'a rien réglé (la slide garde son rendu d'avant). */
    public fun backgroundTransform(): StoryBackgroundTransform? =
        StoryBackgroundTransform(videoFitMode = fitMode, backdrop = backdrop).takeUnless { it.isIdentity }

    public companion object {
        public fun wire(effect: StoryTransitionEffect): String = when (effect) {
            StoryTransitionEffect.FADE -> "fade"
            StoryTransitionEffect.ZOOM -> "zoom"
            StoryTransitionEffect.SLIDE -> "slide"
            StoryTransitionEffect.REVEAL -> "reveal"
        }

        /** Une valeur inconnue (client plus récent) se lit comme ABSENTE : jamais une exception sur un brouillon. */
        public fun parseTransition(raw: String?): StoryTransitionEffect? =
            StoryTransitionEffect.entries.firstOrNull { wire(it) == raw }
    }
}
