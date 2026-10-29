package me.meeshy.app.feed

import androidx.compose.runtime.Immutable
import me.meeshy.sdk.model.FeedMediaType
import me.meeshy.sdk.model.StoryItem
import me.meeshy.sdk.model.composesScene

/**
 * Ce qu'un réel montre dans le fil, AU REPOS (iOS `ReelFeedCard.background` / `ReelRepostEmbedCell.poster`) :
 * jamais un lecteur vidéo par carte, une seule image ou une scène muette.
 */
@Immutable
sealed interface ReelCover {

    /** Le réel est composé et n'a ni vidéo ni image à montrer : sa scène se rejoue, muette (iOS `soundSceneDocument`). */
    data class Scene(val item: StoryItem) : ReelCover

    /** Une image fixe : la vignette de la vidéo, ou l'image du réel, derrière son thumbHash. */
    data class Poster(
        val url: String,
        val thumbHash: String?,
        val tintHex: String,
        val isVideo: Boolean,
    ) : ReelCover

    /** Aucun visuel (réel audio seul, vidéo sans vignette) : l'aplat d'accent et son glyphe (iOS `ReelAudioBackdrop`). */
    data class Backdrop(val isVideo: Boolean) : ReelCover
}

object ReelCoverResolver {

    /**
     * La couverture d'un réel. Le visuel est la vidéo, sinon la première image (iOS `reelBackgroundMedia`) — le
     * média JOUÉ, qui préfère l'audio à l'image, n'est pas le visuel. Sans visuel, une scène composée se rejoue ;
     * sinon l'aplat. [scene] n'est évalué que si la scène est la réponse.
     */
    fun resolve(media: List<FeedMediaItem>, scene: () -> StoryItem?): ReelCover {
        val background = media.reelVisual()
        val poster = background?.let(::poster)
        if (poster != null) return poster
        val item = if (background == null) scene()?.takeIf { it.storyEffects.composesScene() } else null
        return if (item != null) ReelCover.Scene(item) else ReelCover.Backdrop(isVideo = background != null)
    }

    private fun poster(media: FeedMediaItem): ReelCover.Poster? {
        val isVideo = media.type == FeedMediaType.VIDEO
        val url = (if (isVideo) media.thumbnailUrl else media.url ?: media.thumbnailUrl)?.takeIf { it.isNotBlank() }
        return url?.let { ReelCover.Poster(url = it, thumbHash = media.thumbHash, tintHex = media.thumbnailColor, isVideo = isVideo) }
    }

    /** Rapport largeur / hauteur de la carte d'un réel : 4:5 sans dimensions, bornée entre 4:5 (vertical) et 4:3 (paysage) (iOS `reelCardAspectRatio`). */
    fun cardAspect(width: Int?, height: Int?): Float {
        if (width == null || height == null || width <= 0 || height <= 0) return TALLEST_ASPECT
        return (width.toFloat() / height).coerceIn(TALLEST_ASPECT, WIDEST_ASPECT)
    }

    private const val TALLEST_ASPECT = 0.8f
    private const val WIDEST_ASPECT = 4f / 3f
}

/** Le visuel d'un réel : la vidéo, sinon la première image (iOS `FeedPost.reelBackgroundMedia`). */
internal fun List<FeedMediaItem>.reelVisual(): FeedMediaItem? =
    firstOrNull { it.type == FeedMediaType.VIDEO } ?: firstOrNull { it.type == FeedMediaType.IMAGE }
