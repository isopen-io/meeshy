package me.meeshy.ui.story.canvas

import android.net.Uri
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.key
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import me.meeshy.sdk.model.StoryDrawingStroke
import me.meeshy.sdk.model.scene.MeeshySceneObject
import me.meeshy.sdk.model.scene.SceneMediaLayerRules
import me.meeshy.sdk.model.scene.SceneRenderItem
import java.io.File

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
    mediaEnvironment: SceneMediaEnvironment = SceneMediaEnvironment.Default,
    drawingBelowObjects: Boolean = false,
    background: @Composable () -> Unit = {},
    cornerRadius: Dp = 0.dp,
    playbackSeconds: Double? = null,
    rootTransition: SceneRootTransitionSpec? = null,
) {
    val rootPose = rememberSceneRootPose(rootTransition, playbackSeconds)
    val resolved = rememberUpdatedState(events)
    val pending = remember(items.map { it.id to it.kind }, mediaEnvironment.isReader) { SceneReadiness(items, mediaUrlOf, mediaEnvironment.isReader) }
    val tracked = remember(pending, events) {
        events.copy(onImageResolved = { url ->
            events.onImageResolved(url)
            if (pending.resolve(url)) resolved.value.onContentReady?.invoke()
        })
    }
    LaunchedEffect(pending) { if (pending.isReady) resolved.value.onContentReady?.invoke() }
    LaunchedEffect(playbackSeconds) { playbackSeconds?.let { resolved.value.onPlaybackTime?.invoke(it) } }
    Box(modifier.then(if (cornerRadius > 0.dp) Modifier.clip(RoundedCornerShape(cornerRadius)) else Modifier).fillMaxSize().sceneRootTransition(rootPose)) {
        SceneBackdropHost(content = background)
        if (drawingBelowObjects) SceneDrawingLayer(strokes)
        items.forEach { item ->
            key(item.kind, item.id) {
                val url = remember(item.signature, mediaEnvironment.isReader) { item.resolvedUrl(mediaUrlOf, mediaEnvironment.isReader) }
                SceneItemRenderer(remember(item.signature, url) { SceneNode(item, url) }, tracked, mediaEnvironment)
            }
        }
        if (!drawingBelowObjects) SceneDrawingLayer(strokes)
    }
}

internal fun SceneRenderItem.resolvedUrl(mediaUrlOf: (String) -> String?, isReader: Boolean): String? = when (val s = source) {
    is MeeshySceneObject.Media -> SceneMediaLayerRules.playableUrl(
        serverUrl = s.value.postMediaId.takeIf { it.isNotBlank() }?.let(mediaUrlOf),
        mediaUrl = s.value.mediaURL,
        isReader = isReader,
        fileExists = { File(Uri.parse(it).path.orEmpty()).exists() },
    )
    is MeeshySceneObject.Sticker -> s.value.postMediaId.takeIf { it.isNotBlank() }?.let(mediaUrlOf)
    else -> null
}
