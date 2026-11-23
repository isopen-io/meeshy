package me.meeshy.sdk.model.contentcard

import me.meeshy.sdk.model.StoryEffects
import me.meeshy.sdk.model.StoryMediaObject

/**
 * **Ce que le bloc visuel de la carte d'un contenu montre** (#20233, jumelle de #20211, règle iOS `ContentCardVisual`).
 *
 * > « Une carte IMAGE swappable si réel ou post de plusieurs images, image de garde de la vidéo si une vidéo, un composant
 * > sonore avec play si c'est juste un son de fond, sinon le fond de la scène dessiné avec les éléments sur la scène de
 * > base ! » — le porteur.
 *
 * Rejouée sur les vecteurs partagés `packages/shared/fixtures/content-card-visual/`, comme iOS et le web.
 */
sealed interface ContentCardVisual {
    /** Du texte seulement : la carte n'a pas de bloc visuel. */
    data object None : ContentCardVisual

    /** Une image, ou l'image de garde d'une vidéo avec le signe lecture. */
    data class Media(val media: ContentCardMedia) : ContentCardVisual

    /** Deux pages ou plus, qu'on fait glisser une à une ; le glissement n'ouvre rien. */
    data class Slideshow(val pages: List<ContentCardPage>) : ContentCardVisual

    /**
     * Un son seul, qu'on écoute sans quitter la conversation. [attachmentId] est l'identité de la piste pour le lecteur :
     * le média audio, ou `<post>-audio` pour le son de fond du contenu.
     */
    data class Sound(val attachmentId: String, val url: String, val durationSeconds: Int?) : ContentCardVisual

    /** La scène d'index donné du contenu, arrêtée : son fond et les objets posés. */
    data class Scene(val index: Int) : ContentCardVisual
}

/** Une page du diaporama : un média du contenu, ou une scène de son document. */
sealed interface ContentCardPage {
    data class Media(val media: ContentCardMedia) : ContentCardPage

    data class Scene(val index: Int) : ContentCardPage
}

/**
 * La règle, dans l'ordre du porteur : plusieurs pages ⇒ diaporama ; une vidéo seule (un post d'un clip, ou une scène qui
 * n'est que ce clip) ⇒ son image de garde ; rien de peint mais un son ⇒ le composant sonore ; sinon la scène composée, à
 * défaut l'image seule, et rien pour du texte. Une scène qui n'est QU'UNE image se montre en image : même pixel.
 */
internal object ContentCardVisualRule {

    /** [scenes] : les scènes du document, aplaties une à une ; vide quand le contenu n'en porte pas. */
    fun of(pages: List<ContentCardMedia>, sound: ContentCardVisual.Sound?, scenes: List<StoryEffects>): ContentCardVisual {
        val first = scenes.firstOrNull() ?: return mediaVisual(pages, sound)
        if (scenes.size > 1) return ContentCardVisual.Slideshow(scenes.indices.map(ContentCardPage::Scene))
        val paintedMedia = first.mediaObjects.orEmpty().filter(::paintsPixels)
        val paintedCount = paintedMedia.size + otherPaintedCount(first)
        if (paintedCount == 0) return sound ?: ContentCardVisual.Scene(0)
        val only = paintedMedia.singleOrNull()?.takeIf { paintedCount == 1 } ?: return ContentCardVisual.Scene(0)
        val shown = pages.firstOrNull { it.id == only.postMediaId } ?: return ContentCardVisual.Scene(0)
        return ContentCardVisual.Media(shown)
    }

    private fun mediaVisual(pages: List<ContentCardMedia>, sound: ContentCardVisual.Sound?): ContentCardVisual = when {
        pages.size > 1 -> ContentCardVisual.Slideshow(pages.map(ContentCardPage::Media))
        pages.size == 1 -> ContentCardVisual.Media(pages.single())
        else -> sound ?: ContentCardVisual.None
    }

    /**
     * Un média de FOND ne peint que s'il porte une image à lui (une adresse, une identité de média, une forme déclarée) :
     * le porteur d'une couleur n'en porte aucune (iOS `SceneShape.paintsPixels` / `carriesPicture`).
     */
    private fun paintsPixels(media: StoryMediaObject): Boolean =
        !media.isBackground || media.postMediaId.isNotBlank() || !media.mediaURL.isNullOrBlank() || (media.aspectRatio ?: 0.0) > 0.0

    /** Ce qui peint en plus des médias : textes, stickers, lieux, dessin. Un son et une mention ne peignent rien. */
    private fun otherPaintedCount(scene: StoryEffects): Int =
        scene.textObjects.size +
            scene.stickerObjects.orEmpty().size +
            scene.locationObjects.size +
            (if (scene.drawingStrokes.isNullOrEmpty()) 0 else 1)
}
