package me.meeshy.ui.story.canvas

import androidx.compose.runtime.Composable
import me.meeshy.sdk.model.scene.MeeshySceneObject

/**
 * Le dispatcher UNIQUE : un fichier de couche par genre d'objet. Le nœud est stable (égal par signature) : Compose ne
 * rappelle ce composable que pour un élément dont la pose ou le contenu a changé.
 */
@Composable
internal fun SceneItemRenderer(
    node: SceneNode,
    events: SceneCanvasEvents,
    mediaEnvironment: SceneMediaEnvironment = SceneMediaEnvironment.Default,
) {
    when (node.item.kind) {
        MeeshySceneObject.Kind.MEDIA -> SceneMediaLayer(node, events, environment = mediaEnvironment)
        MeeshySceneObject.Kind.TEXT -> SceneTextLayer(node)
        MeeshySceneObject.Kind.STICKER -> SceneStickerLayer(node, events)
        MeeshySceneObject.Kind.PLACE -> SceneLocationLayer(node)
        MeeshySceneObject.Kind.AUDIO -> SceneAudioChipLayer(node)
    }
}
