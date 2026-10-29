package me.meeshy.app.stories

import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.key
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.layout.ContentScale
import coil.compose.AsyncImage
import kotlin.math.roundToInt
import kotlinx.coroutines.isActive
import me.meeshy.sdk.model.scene.StoryBackgroundObjectTransform
import me.meeshy.ui.component.audio.AudioTrackSurface
import me.meeshy.ui.component.media.rememberThumbHashPainter
import me.meeshy.ui.component.video.ReelPlayerHandle
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
    rewindWhenInactive: Boolean = false,
    onAudioFocusLost: () -> Unit = {},
    onImageResolved: (String) -> Unit = {},
    onBackgroundPlayer: (ReelPlayerHandle?) -> Unit = {},
    stillFrame: Boolean = false,
) {
    when {
        slide.backgroundVideoUrl != null && !stillFrame -> {
            val bg = slide.backgroundTransform
            ReelVideoSurface(
                mediaUrl = slide.backgroundVideoUrl,
                isActive = playing,
                rewindWhenInactive = rewindWhenInactive,
                muted = muted,
                loads = loads,
                // Un vocal ou un appel prend le son : la scène se fige avec la vidéo.
                onAudioFocusLost = onAudioFocusLost,
                // La fenêtre de lecture que l'auteur a posée (#5129) — `null` quand la source joue en entier.
                sourceStartMs = slide.backgroundVideoWindow?.startMs,
                sourceEndMs = slide.backgroundVideoWindow?.endMs,
                onPlayer = onBackgroundPlayer,
                modifier = Modifier.fillMaxSize().graphicsLayer { frame(bg) },
            )
        }
        // Au repos le fond vidéo n'a pas de lecteur : son affiche (vignette, sinon ThumbHash) garde le cadre, l'aplat dessous.
        slide.backgroundVideoUrl != null && restingPosterKind(slide.backgroundPosterUrl, slide.backgroundThumbHash) != RestingPosterKind.NONE -> {
            val bg = slide.backgroundTransform
            Box(Modifier.fillMaxSize()) {
                Box(Modifier.fillMaxSize().background(StorySceneFill.resolve(slide.background, slide.accentHex).brush()))
                StoryRestingPoster(
                    posterUrl = slide.backgroundPosterUrl,
                    thumbHash = slide.backgroundThumbHash,
                    lookRecipe = slide.lookRecipe,
                    modifier = Modifier.fillMaxSize().graphicsLayer { frame(bg) },
                )
            }
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

/**
 * Les pistes sonores de la scène (fond puis premier plan) ; [muted] les ramène à 0. [lap] : le tour d'une scène
 * rejouée en boucle — une piste qui ne boucle pas d'elle-même repart à chaque tour ([StorySceneLoop]).
 */
@Composable
internal fun StorySceneAudio(
    slide: StorySlideView,
    playing: Boolean,
    muted: Boolean,
    rewindWhenInactive: Boolean = false,
    lap: Int = 0,
) {
    slide.backgroundAudioUrl?.let { url ->
        key(url, StorySceneLoop.restartKey(loops = slide.backgroundLoop, lap = lap)) {
            AudioTrackSurface(
                mediaUrl = url,
                isActive = playing,
                rewindWhenInactive = rewindWhenInactive,
                volume = if (muted) 0f else 1f,
                loop = slide.backgroundLoop,
                sourceStartMs = slide.backgroundAudioWindow?.startMs,
                sourceEndMs = slide.backgroundAudioWindow?.endMs,
            )
        }
    }
    slide.foregroundAudioUrl?.let { url ->
        key(url, StorySceneLoop.restartKey(loops = false, lap = lap)) {
            AudioTrackSurface(
                mediaUrl = url,
                isActive = playing,
                rewindWhenInactive = rewindWhenInactive,
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
 * médias jouent. Une scène qui n'est plus [playing] sans être [rewindWhenIdle] garde sa position ; avec, l'horloge
 * ET les médias repartent de zéro, ensemble. [onBackgroundPlayer] tend le lecteur de la vidéo de fond (sonde de sa
 * piste audio).
 *
 * [resting] : la scène est une image fixe (#13663) et n'a AUCUN lecteur (ni la vidéo de fond, ni les vidéos posées, ni les
 * pistes). Le fond vidéo et chaque vidéo posée gardent leur cadre avec leur affiche (la vignette, sinon le ThumbHash ; l'aplat
 * d'accent quand la vidéo n'a ni l'un ni l'autre) ; images, textes et stickers se dessinent à la position de l'horloge — zéro
 * pour une scène neuve, la dernière reprise quand [rewindWhenIdle] est faux. Seule la scène que le fil élit joue.
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
    onBackgroundPlayer: (ReelPlayerHandle?) -> Unit = {},
    resting: Boolean = false,
) {
    val progress = remember(slide.id) { Animatable(0f) }
    var lap by remember(slide.id) { mutableIntStateOf(0) }
    val durationMs = slide.autoAdvanceMillis.coerceAtLeast(1)
    LaunchedEffect(slide.id, playing, loads) {
        if (!playing || !loads) return@LaunchedEffect
        while (isActive) {
            val remainingMs = ((1f - progress.value) * durationMs).roundToInt().coerceAtLeast(0)
            progress.animateTo(1f, tween(durationMillis = remainingMs, easing = LinearEasing))
            progress.snapTo(0f)
            lap += 1
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
            rewindWhenInactive = rewindWhenIdle,
            onAudioFocusLost = onAudioFocusLost,
            onBackgroundPlayer = onBackgroundPlayer,
            stillFrame = resting,
        )
        if (loads) {
            StorySceneOverlays(
                slide = slide,
                progress = progress,
                slideDurationMs = durationMs,
                playing = playing,
                muted = muted,
                rewindWhenInactive = rewindWhenIdle,
                onAudioFocusLost = onAudioFocusLost,
                players = !resting,
            )
            if (!resting) StorySceneAudio(slide = slide, playing = playing, muted = muted, rewindWhenInactive = rewindWhenIdle, lap = lap)
        }
    }
}

/**
 * Le tour d'une scène rejouée en boucle (réel, iOS `MeeshyScenePlayer` en mode `.reel`) : une piste qui boucle
 * d'elle-même garde son fil d'un tour à l'autre, une piste qui ne boucle pas (un vocal posé) repart avec la scène —
 * sinon elle se tairait dès le deuxième tour.
 */
object StorySceneLoop {
    fun restartKey(loops: Boolean, lap: Int): Int = if (loops) 0 else lap
}
