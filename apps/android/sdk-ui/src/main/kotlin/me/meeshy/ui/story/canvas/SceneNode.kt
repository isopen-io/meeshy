package me.meeshy.ui.story.canvas

import androidx.compose.runtime.Immutable
import me.meeshy.sdk.model.scene.SceneItemSignature
import me.meeshy.sdk.model.scene.SceneRenderItem

/**
 * Le nœud d'un élément : un état Compose STABLE indexé par la signature de l'élément (miroir du cache de nœuds
 * d'iOS `StoryRendererCache`). Deux nœuds de même signature et de même adresse de média sont égaux : Compose saute la
 * recomposition de tout élément dont la pose, la présence, le texte servi et le contenu n'ont pas changé, donc un
 * playhead qui avance ne recompose que ce qui bouge.
 */
@Immutable
public class SceneNode(public val item: SceneRenderItem, public val mediaUrl: String? = null) {

    public val signature: SceneItemSignature get() = item.signature

    override fun equals(other: Any?): Boolean =
        this === other || (other is SceneNode && other.signature == signature && other.mediaUrl == mediaUrl && other.item.source == item.source)

    override fun hashCode(): Int = 31 * (31 * signature.hashCode() + (mediaUrl?.hashCode() ?: 0)) + item.source.hashCode()
}
