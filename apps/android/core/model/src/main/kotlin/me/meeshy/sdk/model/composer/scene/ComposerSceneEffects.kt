package me.meeshy.sdk.model.composer.scene

import me.meeshy.sdk.model.StoryTransitionEffect

/**
 * Une FAMILLE d'effets de la scène (miroir de `ComposerSceneEffect` iOS, #8712) : l'ouverture/fermeture de la slide, ou
 * le LOOK du fond (filtre + intensité). `ImageEffect` n'y est pas : il appartient à la retouche, qui le cuit.
 */
public enum class ComposerSceneEffect { OPENING, VISUAL }

public enum class ComposerSceneBackground { IMAGE, VIDEO }

public data class SceneTransitions(val opening: StoryTransitionEffect?, val closing: StoryTransitionEffect?)

/** Ce qu'un carrousel vient de choisir. */
public sealed interface SceneEffectChoice {
    public data class Opening(val effect: StoryTransitionEffect?) : SceneEffectChoice
    public data class Closing(val effect: StoryTransitionEffect?) : SceneEffectChoice
    public data class Visual(val filter: String?) : SceneEffectChoice
}

public object ComposerSceneEffects {

    /** Aucun fond média, aucune colonne (loi 4) ; une vidéo de fond ne rend aucun effet visuel. */
    public fun served(background: ComposerSceneBackground?): List<ComposerSceneEffect> = when (background) {
        ComposerSceneBackground.IMAGE -> listOf(ComposerSceneEffect.OPENING, ComposerSceneEffect.VISUAL)
        ComposerSceneBackground.VIDEO -> listOf(ComposerSceneEffect.OPENING)
        null -> emptyList()
    }

    public fun toggled(tapped: ComposerSceneEffect, open: ComposerSceneEffect?): ComposerSceneEffect? =
        if (open == tapped) null else tapped

    public fun carousel(
        open: ComposerSceneEffect?,
        served: List<ComposerSceneEffect>,
        objectSelected: Boolean,
        toolIsOpen: Boolean,
    ): ComposerSceneEffect? = open?.takeIf { it in served && !objectSelected && !toolIsOpen }

    public fun transitions(choice: SceneEffectChoice, current: SceneTransitions): SceneTransitions = when (choice) {
        is SceneEffectChoice.Opening -> current.copy(opening = choice.effect)
        is SceneEffectChoice.Closing -> current.copy(closing = choice.effect)
        is SceneEffectChoice.Visual -> current
    }

    /** Chaque choix rejoue l'ouverture puis la fermeture ; `null` quand la slide n'a aucune transition. */
    public fun rehearsal(choice: SceneEffectChoice, current: SceneTransitions): SceneTransitions? =
        transitions(choice, current).takeUnless { it.opening == null && it.closing == null }
}
