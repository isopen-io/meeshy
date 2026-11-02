package me.meeshy.app.stories

import androidx.compose.foundation.Image
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.testTag
import coil.compose.AsyncImage
import me.meeshy.sdk.model.scene.SceneLookRecipe
import me.meeshy.ui.component.media.rememberThumbHashPainter
import me.meeshy.ui.story.canvas.SceneLookChain

internal const val STORY_RESTING_POSTER_TAG = "story-resting-poster"
internal const val STORY_RESTING_THUMBHASH_TAG = "story-resting-thumbhash"

/** Ce qu'une vidéo au repos peut montrer à la place de son lecteur (#13663). */
internal enum class RestingPosterKind { POSTER, THUMBHASH, NONE }

/** La vignette que le serveur sert d'abord, son ThumbHash à défaut, sinon rien : l'appelant garde alors l'aplat d'accent. */
internal fun restingPosterKind(posterUrl: String?, thumbHash: String?): RestingPosterKind = when {
    !posterUrl.isNullOrBlank() -> RestingPosterKind.POSTER
    !thumbHash.isNullOrBlank() -> RestingPosterKind.THUMBHASH
    else -> RestingPosterKind.NONE
}

/**
 * L'affiche d'une vidéo dans une scène au repos : aucun lecteur n'existe, mais le cadre de la vidéo (fond ou pièce posée)
 * garde son image — la vignette, derrière son ThumbHash qui s'affiche tant qu'elle charge. Sans l'une ni l'autre, rien
 * n'est peint ici. Une vidéo AJUSTÉE ([fits]) garde son affiche entière, comme elle joue.
 */
@Composable
internal fun StoryRestingPoster(
    posterUrl: String?,
    thumbHash: String?,
    lookRecipe: SceneLookRecipe,
    modifier: Modifier = Modifier,
    fits: Boolean = false,
) {
    val blur = rememberThumbHashPainter(thumbHash)
    val scale = if (fits) ContentScale.Fit else ContentScale.Crop
    when (restingPosterKind(posterUrl, thumbHash)) {
        RestingPosterKind.POSTER -> AsyncImage(
            model = posterUrl,
            contentDescription = null,
            contentScale = scale,
            colorFilter = SceneLookChain.colorFilter(lookRecipe),
            placeholder = blur,
            error = blur,
            modifier = modifier.testTag(STORY_RESTING_POSTER_TAG),
        )
        RestingPosterKind.THUMBHASH -> blur?.let {
            Image(
                painter = it,
                contentDescription = null,
                contentScale = scale,
                colorFilter = SceneLookChain.colorFilter(lookRecipe),
                modifier = modifier.testTag(STORY_RESTING_THUMBHASH_TAG),
            )
        }
        RestingPosterKind.NONE -> Unit
    }
}
