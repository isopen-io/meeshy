package me.meeshy.ui.story.canvas

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.Composable
import androidx.compose.runtime.key
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import me.meeshy.sdk.model.StoryDrawingStroke
import me.meeshy.sdk.model.scene.MeeshySceneObject
import me.meeshy.sdk.model.scene.SceneRenderItem

/**
 * La surface UNIQUE d'une scène en lecture (iOS `StoryCanvasUIView`) : fond, puis les éléments du plan de rendu dans
 * l'ordre du plan (médias, textes, stickers, lieux, puces), puis le dessin. Elle accepte un 9:16 de toute taille
 * (tuile, plein écran) ; l'horloge appartient à l'hôte, qui recalcule le plan ([me.meeshy.sdk.model.scene.SceneRenderPlanner])
 * à chaque tête de lecture : à playhead égal, la même image.
 *
 * [mediaUrlOf] résout l'adresse d'un média ou d'un sticker image ; sans adresse (hors ligne), l'élément est ignoré.
 */
@Composable
public fun SceneCanvas(
    items: List<SceneRenderItem>,
    modifier: Modifier = Modifier,
    mediaUrlOf: (String) -> String? = { null },
    strokes: List<StoryDrawingStroke> = emptyList(),
    events: SceneCanvasEvents = SceneCanvasEvents.None,
    background: @Composable () -> Unit = {},
) {
    Box(modifier.fillMaxSize()) {
        SceneBackdropHost(content = background)
        items.forEach { item ->
            key(item.kind, item.id) {
                val url = remember(item.signature) { item.resolvedUrl(mediaUrlOf) }
                SceneItemRenderer(remember(item.signature, url) { SceneNode(item, url) }, events)
            }
        }
        SceneDrawingLayer(strokes)
    }
}

private fun SceneRenderItem.resolvedUrl(mediaUrlOf: (String) -> String?): String? = when (val s = source) {
    is MeeshySceneObject.Media -> s.value.postMediaId.takeIf { it.isNotBlank() }?.let(mediaUrlOf) ?: s.value.mediaURL
    is MeeshySceneObject.Sticker -> s.value.postMediaId.takeIf { it.isNotBlank() }?.let(mediaUrlOf)
    else -> null
}
