package me.meeshy.app.stories

import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.key
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.layout.ContentScale
import coil.compose.AsyncImage
import kotlin.math.roundToInt
import kotlinx.coroutines.isActive
import me.meeshy.sdk.model.scene.StoryBackgroundObjectTransform
import me.meeshy.ui.component.audio.AudioTrackSurface
import me.meeshy.ui.component.media.rememberThumbHashPainter
import me.meeshy.ui.component.video.ReelVideoSurface
import me.meeshy.ui.story.canvas.SceneLookChain
import me.meeshy.ui.theme.hexColor

private fun androidx.compose.ui.graphics.GraphicsLayerScope.frame(bg: StoryBackgroundObjectTransform) {
    // Deux axes depuis #5085 : un recadrage non carré agrandit différemment en largeur et en hauteur.
    scaleX = bg.scaleX
    scaleY = bg.scaleY
    rotationZ = bg.rotationDegrees
    translationX = bg.offsetXFraction * size.width
    translationY = bg.offsetYFraction * size.height
}

/**
 * Le fond d'une scène : vidéo, image (ThumbHash en attendant) ou aplat/dégradé. Site UNIQUE du lecteur de
 * stories et du lecteur de réels — une même publication y est peinte à l'identique.
 */
@Composable
internal fun StorySceneBackground(
    slide: StorySlideView,
    playing: Boolean,
    muted: Boolean,
    loads: Boolean = true,
    onAudioFocusLost: () -> Unit = {},
    onImageResolved: (String) -> Unit = {},
) {
    when {
        slide.backgroundVideoUrl != null -> {
            val bg = slide.backgroundTransform
            ReelVideoSurface(
                mediaUrl = slide.backgroundVideoUrl,
                isActive = playing,
                rewindWhenInactive = false,
                muted = muted,
                loads = loads,
                // Un vocal ou un appel prend le son : la scène se fige avec la vidéo.
                onAudioFocusLost = onAudioFocusLost,
                // La fenêtre de lecture que l'auteur a posée (#5129) — `null` quand la source joue en entier.
                sourceStartMs = slide.backgroundVideoWindow?.startMs,
                sourceEndMs = slide.backgroundVideoWindow?.endMs,
                modifier = Modifier.fillMaxSize().graphicsLayer { frame(bg) },
            )
        }
        slide.imageUrl != null -> {
            val imageUrl = slide.imageUrl
            val bg = slide.backgroundTransform
            AsyncImage(
                model = imageUrl,
                contentDescription = null,
                contentScale = ContentScale.Crop,
                colorFilter = SceneLookChain.colorFilter(slide.lookRecipe),
                // Flou instantané derrière l'image qui charge — aucun éclair noir à froid.
                placeholder = rememberThumbHashPainter(slide.backgroundThumbHash),
                onSuccess = { onImageResolved(imageUrl) },
                onError = { onImageResolved(imageUrl) },
                modifier = Modifier.fillMaxSize().graphicsLayer { frame(bg) },
            )
        }
        else -> Box(
            modifier = Modifier
                .fillMaxSize()
                .background(StorySceneFill.resolve(slide.background, slide.accentHex).brush()),
        )
    }
}

/** Les pistes sonores de la scène (fond puis premier plan) ; [muted] les ramène à 0. */
@Composable
internal fun StorySceneAudio(slide: StorySlideView, playing: Boolean, muted: Boolean) {
    slide.backgroundAudioUrl?.let { url ->
        key(url) {
            AudioTrackSurface(
                mediaUrl = url,
                isActive = playing,
                rewindWhenInactive = false,
                volume = if (muted) 0f else 1f,
                loop = slide.backgroundLoop,
                sourceStartMs = slide.backgroundAudioWindow?.startMs,
                sourceEndMs = slide.backgroundAudioWindow?.endMs,
            )
        }
    }
    slide.foregroundAudioUrl?.let { url ->
        key(url) {
            AudioTrackSurface(
                mediaUrl = url,
                isActive = playing,
                rewindWhenInactive = false,
                volume = if (muted) 0f else 1f,
                loop = false,
                // Un vocal rogné compte autant qu'une vidéo rognée (#5129).
                sourceStartMs = slide.foregroundAudioWindow?.startMs,
                sourceEndMs = slide.foregroundAudioWindow?.endMs,
            )
        }
    }
}

/**
 * La scène d'une publication, rejouée en boucle (iOS `MeeshyScenePlayer` en mode réel) : fond, médias posés,
 * textes, stickers, pastilles sonores et pistes — le MÊME rendu que le lecteur de stories.
 *
 * [loads] : les décodeurs (vidéos, sons) ne naissent que pour la page affichée et ses voisines ; hors de cette
 * fenêtre la scène n'est que son fond statique, ses textes et ses stickers. [playing] : l'horloge avance et les
 * médias jouent. Une scène qui n'est plus [playing] sans être [rewindWhenIdle] garde sa position.
 */
@Composable
fun StoryScenePlayer(
    slide: StorySlideView,
    playing: Boolean,
    muted: Boolean,
    loads: Boolean,
    rewindWhenIdle: Boolean,
    modifier: Modifier = Modifier,
    onAudioFocusLost: () -> Unit = {},
) {
    val progress = remember(slide.id) { Animatable(0f) }
    val durationMs = slide.autoAdvanceMillis.coerceAtLeast(1)
    LaunchedEffect(slide.id, playing, loads) {
        if (!playing || !loads) return@LaunchedEffect
        while (isActive) {
            val remainingMs = ((1f - progress.value) * durationMs).roundToInt().coerceAtLeast(0)
            progress.animateTo(1f, tween(durationMillis = remainingMs, easing = LinearEasing))
            progress.snapTo(0f)
        }
    }
    LaunchedEffect(rewindWhenIdle) {
        if (rewindWhenIdle) progress.snapTo(0f)
    }
    Box(modifier.fillMaxSize().background(hexColor(slide.accentHex))) {
        StorySceneBackground(
            slide = slide,
            playing = playing,
            muted = muted,
            loads = loads,
            onAudioFocusLost = onAudioFocusLost,
        )
        if (loads) {
            StorySceneOverlays(
                slide = slide,
                progress = progress,
                slideDurationMs = durationMs,
                playing = playing,
                muted = muted,
                onAudioFocusLost = onAudioFocusLost,
            )
            StorySceneAudio(slide = slide, playing = playing, muted = muted)
        }
    }
}
