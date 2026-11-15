package me.meeshy.sdk.story

import me.meeshy.sdk.model.ApiPost
import me.meeshy.sdk.model.MosaicLayoutMode
import me.meeshy.sdk.model.PostSceneReading
import me.meeshy.sdk.model.StoryItem

/** Les scènes d'un post prêtes pour le moteur unique de la scène, et la disposition que l'auteur a choisie pour elles. */
public data class PostSceneItems(val items: List<StoryItem>, val layout: MosaicLayoutMode)

/**
 * **Un post à scène se lit scène par scène** (#13863 R7, miroir d'iOS `PostSceneCard` / `PostSceneMosaic`) : chaque scène
 * devient un [StoryItem] que le player peint, avec ses seules pièces ([PostSceneReading.designatedMediaIds]) — une scène de
 * texte n'emprunte jamais la photo d'une autre. `null` pour un post sans scène, qui garde son rendu de fil, et pour une
 * republication, dont la citation a déjà sa propre scène.
 */
public fun ApiPost.sceneItems(): PostSceneItems? {
    if (repostOf != null) return null
    val read = PostSceneReading.of(storyEffects) ?: return null
    val carrier = toStoryItem()
    val several = read.scenes.size > 1
    val items = read.scenes.mapIndexed { index, scene ->
        val designated = PostSceneReading.designatedMediaIds(scene)
        carrier.copy(
            id = if (several) "$id$SCENE_SEPARATOR$index" else id,
            storyEffects = scene,
            media = carrier.media.filter { it.id in designated },
        )
    }
    return PostSceneItems(items = items, layout = read.layout)
}

private const val SCENE_SEPARATOR = "#scene-"
