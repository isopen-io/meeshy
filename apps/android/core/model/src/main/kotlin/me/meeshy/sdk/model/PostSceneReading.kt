package me.meeshy.sdk.model

/** Les scènes d'un post, dans l'ordre où l'auteur les a composées, et la disposition qu'il a choisie pour les montrer. */
data class PostScenes(val scenes: List<StoryEffects>, val layout: MosaicLayoutMode)

/**
 * **Ce que le fil lit d'un post à scène** (#13863 R7) — miroir de la lecture iOS (`FeedPostCard` → `PostSceneCard` /
 * `PostSceneMosaic`) : un post dont la charge porte un document de scènes v3 se peint scène par scène dans le moteur unique
 * de la scène, à la place de ses médias. Les scènes 2 à N viennent du document gardé par [PostReadStoryEffectsSerializer] ;
 * une scène seule est déjà la projection plate de `storyEffects`.
 *
 * Un post sans scène — texte seul, couleur seule, médias sans document — rend `null` et garde son rendu de fil (carrousel
 * ou mosaïque de ses images).
 */
object PostSceneReading {
    fun of(effects: StoryEffects?): PostScenes? {
        effects ?: return null
        val canvas = effects.canvas
        val scenes = canvas?.scenes?.indices?.map { StoryEffects.rendering(canvas, it) } ?: listOf(effects)
        if (scenes.none(::composes)) return null
        return PostScenes(scenes = scenes, layout = effects.resolvedLayout)
    }

    /**
     * Les pièces du post que [scene] désigne : son fond, ses médias posés, ses stickers image et ses sons. Une scène ne lit
     * que les siennes, sans quoi une scène de texte emprunterait la photo d'une autre en guise de fond.
     */
    fun designatedMediaIds(scene: StoryEffects): Set<String> =
        (
            scene.mediaObjects.orEmpty().map { it.postMediaId } +
                scene.stickerObjects.orEmpty().map { it.postMediaId } +
                scene.audioPlayerObjects.orEmpty().map { it.postMediaId }
            ).filterTo(mutableSetOf()) { it.isNotBlank() }

    /** Une scène se peint quand elle porte un objet, un lieu ou un son ; un fond de couleur seul est le post coloré d'avant. */
    private fun composes(scene: StoryEffects): Boolean =
        scene.composesScene() || scene.locationObjects.isNotEmpty() || scene.backgroundAudioId != null
}
