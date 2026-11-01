package me.meeshy.app.feed

import androidx.compose.runtime.Immutable
import me.meeshy.sdk.model.CanvasV3Migration
import me.meeshy.sdk.model.SceneCarouselLayout
import me.meeshy.sdk.model.SceneFraming
import me.meeshy.sdk.model.SceneRect
import me.meeshy.sdk.model.SceneV3
import me.meeshy.sdk.model.StoryEffects
import me.meeshy.sdk.model.StoryItem

/**
 * Ce que la carte montre d'UNE scène (#14199, iOS `PostSceneMosaic.vignette`) : sa fenêtre de cadrage ([focus], `null` pour la
 * scène entière ou une scène qui n'est qu'une image) et le rapport de sa page de carrousel ([pageAspect], `null` pour une scène
 * qui ne montre rien).
 */
@Immutable
data class SceneCardFraming(val focus: SceneRect?, val pageAspect: Double?)

/** Le cadrage des scènes d'un post, lu une fois à sa projection, jamais pendant la composition. */
internal object PostSceneFrames {

    fun of(documents: List<SceneV3>): List<SceneCardFraming> =
        documents.map { SceneCardFraming(focus = SceneFraming.cardFocus(it), pageAspect = SceneCarouselLayout.pageAspect(it)) }

    /**
     * La scène v3 de chaque [scenes] : celle du document servi quand le post le garde (deux scènes ou plus), sinon la scène
     * reconstruite depuis sa projection plate — le cadrage se juge sur les ancres de la scène, jamais sur le modèle peint.
     */
    fun documents(effects: StoryEffects?, scenes: List<StoryItem>): List<SceneV3> =
        effects?.canvas?.scenes?.takeIf { it.size == scenes.size }
            ?: scenes.map { item -> item.storyEffects?.let { CanvasV3Migration.migrate(it).scenes.firstOrNull() } ?: SceneV3() }
}
