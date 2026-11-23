package me.meeshy.sdk.linkcard

import me.meeshy.sdk.model.ApiPost
import me.meeshy.sdk.model.PostSceneReading
import me.meeshy.sdk.model.StoryEffects
import me.meeshy.sdk.model.contentcard.ContentCard
import me.meeshy.sdk.model.contentcard.ContentCardPage
import me.meeshy.sdk.model.contentcard.ContentCardScene
import me.meeshy.sdk.model.contentcard.ContentCardVisual
import me.meeshy.sdk.model.rendering
import me.meeshy.sdk.story.toStoryItem
import me.meeshy.sdk.theme.storyAccentHex

/**
 * **La scène que la carte d'un contenu dessine** (#20233, iOS `ContentCard.Scene`) — quand le bloc visuel élu par
 * [card] est une scène (ou un diaporama de scènes), les scènes du contenu MONTRÉ deviennent des [me.meeshy.sdk.model.StoryItem]
 * que le player peint arrêtés : une page par scène du document, chacune avec ses seules pièces
 * ([PostSceneReading.designatedMediaIds]), sur le sol de l'auteur MONTRÉ. La conversion d'un post en item est celle du
 * lecteur de stories ([toStoryItem]), qui sait déjà lire l'original d'une republication nue.
 */
internal fun ApiPost.contentCardScene(card: ContentCard): ContentCardScene? {
    val carrierId = card.sceneCarrierId ?: return null
    if (!card.visual.drawsAScene()) return null
    val carrier = toStoryItem()
    val effects = carrier.storyEffects ?: return null
    val canvas = effects.canvas
    val scenes = canvas?.scenes?.indices?.map { StoryEffects.rendering(canvas, it) }?.ifEmpty { null } ?: listOf(effects)
    val several = scenes.size > 1
    val items = scenes.mapIndexed { index, scene ->
        val designated = PostSceneReading.designatedMediaIds(scene)
        carrier.copy(
            id = if (several) "$carrierId$SCENE_SEPARATOR$index" else carrierId,
            storyEffects = scene,
            media = carrier.media.filter { it.id in designated },
        )
    }
    val shownAuthor = repostOf?.takeIf { it.id == carrierId }?.author ?: author
    return ContentCardScene(items = items, accentHex = shownAuthor.storyAccentHex())
}

private fun ContentCardVisual.drawsAScene(): Boolean = when (this) {
    is ContentCardVisual.Scene -> true
    is ContentCardVisual.Slideshow -> pages.any { it is ContentCardPage.Scene }
    else -> false
}

private const val SCENE_SEPARATOR = "#scene-"
