package me.meeshy.app.stories

import me.meeshy.sdk.model.StoryBackgroundValue
import me.meeshy.sdk.model.scene.SceneRenderItem
import me.meeshy.sdk.model.scene.SceneRenderMode
import me.meeshy.sdk.model.scene.SceneRenderPlanner
import me.meeshy.sdk.model.scene.SceneSlide

/**
 * La diapo du composeur vue par le canevas unique (iOS `StoryComposerCanvasView` -> `StoryCanvasUIView` en édition) : la
 * même projection que la publication ([publishPlans]) donne les effets, et le plan de rendu en mode ÉDITION — tout
 * visible, à pleine opacité, texte source — dit ce que la scène peint. L'aperçu est le lecteur : aucune seconde liste
 * d'objets n'est tenue par le composeur.
 */
internal object ComposerSlideProjection {

    /** La diapo [slide] telle que le canevas la compare et la reconstruit ; `null` : rien ne se peint (diapo vierge). */
    fun sceneSlide(slide: StorySlide, state: StoryComposerUiState, language: String, floor: StoryBackgroundValue? = null): SceneSlide? {
        val effects = publishPlans(state, language, listOf(slide), floor).single().request.storyEffects ?: return null
        return SceneSlide(id = slide.id, effects = effects)
    }

    /** Ce que le canevas peint pour [slide], dans l'ordre de peinture du plan ; vide pour une diapo vierge. */
    fun plan(slide: StorySlide, state: StoryComposerUiState, language: String, floor: StoryBackgroundValue? = null): List<SceneRenderItem> =
        sceneSlide(slide, state, language, floor)
            ?.let { SceneRenderPlanner.plan(it.lists, time = 0.0, mode = SceneRenderMode.EDIT) }
            .orEmpty()
}
