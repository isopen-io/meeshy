package me.meeshy.ui.story.canvas

import androidx.compose.foundation.Image
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.testTag
import coil.compose.AsyncImage
import me.meeshy.sdk.model.scene.SceneBackgroundFit
import me.meeshy.ui.component.media.rememberThumbHashPainter
import me.meeshy.ui.component.video.ReelVideoSurface

internal const val SCENE_BACKGROUND_POSTER_TAG: String = "scene-background-poster"

/**
 * La vidéo de fond : en BOUCLE sans coupure (le lecteur répète), au gain d'auteur [volume] sauf si la scène est muette
 * ([muted]). Son affiche — la vignette, sinon le ThumbHash flouté — est peinte dessous et reste visible jusqu'à la première
 * image (la surface vidéo a un obturateur transparent) : aucun éclair noir.
 */
@Composable
public fun SceneBackgroundVideoSurface(
    url: String,
    fit: SceneBackgroundFit,
    modifier: Modifier = Modifier,
    posterUrl: String? = null,
    thumbHash: String? = null,
    playing: Boolean = true,
    muted: Boolean = false,
    volume: Float = 1f,
    sourceStartMs: Long? = null,
    sourceEndMs: Long? = null,
    onPlayer: (me.meeshy.ui.component.video.ReelPlayerHandle?) -> Unit = {},
) {
    val scale = if (fit == SceneBackgroundFit.FIT) ContentScale.Fit else ContentScale.Crop
    val hashPainter = rememberThumbHashPainter(thumbHash)
    Box(modifier.fillMaxSize()) {
        when {
            posterUrl != null -> AsyncImage(
                model = posterUrl,
                contentDescription = null,
                contentScale = scale,
                placeholder = hashPainter,
                modifier = Modifier.fillMaxSize().testTag(SCENE_BACKGROUND_POSTER_TAG),
            )
            hashPainter != null -> Image(
                painter = hashPainter,
                contentDescription = null,
                contentScale = scale,
                modifier = Modifier.fillMaxSize().testTag(SCENE_BACKGROUND_POSTER_TAG),
            )
        }
        ReelVideoSurface(
            mediaUrl = url,
            isActive = playing,
            rewindWhenInactive = false,
            muted = muted,
            volume = volume,
            sourceStartMs = sourceStartMs,
            sourceEndMs = sourceEndMs,
            onPlayer = onPlayer,
            fit = fit == SceneBackgroundFit.FIT,
            modifier = Modifier.fillMaxSize(),
        )
    }
}
