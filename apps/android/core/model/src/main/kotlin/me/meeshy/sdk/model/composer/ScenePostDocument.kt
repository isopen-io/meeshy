package me.meeshy.sdk.model.composer

import me.meeshy.sdk.model.CanvasV3Migration
import me.meeshy.sdk.model.MosaicLayoutMode
import me.meeshy.sdk.model.StoryEffects
import me.meeshy.sdk.model.composesScene

/**
 * Le `storyEffects` d'un post ou d'un réel composé sur la scène (#13863 R3) — miroir d'iOS `ComposerPublishChannel` :
 * UN document de scènes v3 (une scène par diapo qui compose quelque chose), celui que le fil relit. Un post qui ne porte
 * que son texte n'a pas de scène : `null`, et la charge reste celle du post texte d'avant ; une seule couleur, celle du
 * post coloré d'avant.
 */
object ScenePostDocument {
    fun effects(scenes: List<StoryEffects?>, armedLayout: MosaicLayoutMode?, format: ComposerFormat): StoryEffects? {
        val composed = scenes.filterNotNull().filter(::composes)
        if (composed.isEmpty()) return null
        composed.singleOrNull()?.takeIf(::isColourOnly)?.let { return StoryEffects(background = it.background) }
        val layout = ComposerMosaicChoice.published(armedLayout, composed.size, format)
        return StoryEffects(canvas = CanvasV3Migration.migrate(composed, layout))
    }

    /** Une couleur et rien d'autre : le post coloré d'avant, son fil v3 « un fond seul » (#13575), jamais un document de scène. */
    private fun isColourOnly(effects: StoryEffects): Boolean =
        !effects.composesScene() && effects.locationObjects.isEmpty() && effects.background != null

    /** Une diapo compose quand elle porte un objet, un lieu ou un fond : sinon elle n'a rien à montrer. */
    fun composes(effects: StoryEffects?): Boolean =
        effects.composesScene() || effects?.background != null || effects?.locationObjects.orEmpty().isNotEmpty()
}
