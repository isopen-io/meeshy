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
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.layout.ContentScale
import coil.compose.AsyncImage
import kotlin.math.roundToInt
import kotlinx.coroutines.isActive
import me.meeshy.sdk.model.scene.SceneAudioTrack
import me.meeshy.sdk.model.scene.StoryBackgroundObjectTransform
import me.meeshy.ui.component.media.rememberThumbHashPainter
import me.meeshy.ui.component.video.ReelPlayerHandle
import me.meeshy.ui.component.video.ReelVideoSurface
import me.meeshy.ui.story.canvas.SceneAudioMixerHost
import me.meeshy.ui.story.canvas.SceneLookChain
import me.meeshy.ui.story.canvas.SceneRootTransitionSpec
import me.meeshy.ui.story.canvas.sceneRootTransition
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
 *
 * Un fond AJUSTÉ ([StorySlideView.backgroundFits], iOS `.resizeAspect`, #14199) tient entier dans la scène, centré, sur ses
 * bandes ([SceneBackdropLayer]) ; sinon il la remplit, rogné au centre. Le cadrage de l'auteur s'applique par-dessus, dans les
 * deux cas.
 */
@Composable
internal fun StorySceneBackground(
    slide: StorySlideView,
    playing: Boolean,
    muted: Boolean,
    loads: Boolean = true,
    rewindWhenInactive: Boolean = false,
    onAudioFocusLost: () -> Unit = {},
    onAudioFocusGained: () -> Unit = {},
    onAudioFocusLostForGood: () -> Unit = {},
    onImageResolved: (String) -> Unit = {},
    onBackgroundPlayer: (ReelPlayerHandle?) -> Unit = {},
    stillFrame: Boolean = false,
    floor: SceneFloor = SceneFloor.AUTHOR_GRADIENT,
) {
    when {
        slide.backgroundVideoUrl != null && !stillFrame -> {
            val bg = slide.backgroundTransform
            if (slide.backgroundFits) SceneBackdropLayer(slide.backdrop, slide.backgroundPosterUrl)
            ReelVideoSurface(
                mediaUrl = slide.backgroundVideoUrl,
                isActive = playing,
                rewindWhenInactive = rewindWhenInactive,
                muted = muted,
                loads = loads,
                // Un vocal ou un appel prend le son : la scène se fige avec la vidéo.
                onAudioFocusLost = onAudioFocusLost,
                onAudioFocusGained = onAudioFocusGained,
                onAudioFocusLostForGood = onAudioFocusLostForGood,
                // La fenêtre de lecture que l'auteur a posée (#5129) — `null` quand la source joue en entier.
                sourceStartMs = slide.backgroundVideoWindow?.startMs,
                sourceEndMs = slide.backgroundVideoWindow?.endMs,
                onPlayer = onBackgroundPlayer,
                fit = slide.backgroundFits,
                modifier = Modifier.fillMaxSize().graphicsLayer { frame(bg) },
                effects = rememberSceneVideoEffects(slide.backgroundVideoUrl, slide.backgroundPosterUrl, slide.composerLooks),
            )
        }
        // Au repos le fond vidéo n'a pas de lecteur : son affiche (vignette, sinon ThumbHash) garde le cadre, l'aplat dessous.
        slide.backgroundVideoUrl != null && restingPosterKind(slide.backgroundPosterUrl, slide.backgroundThumbHash) != RestingPosterKind.NONE -> {
            val bg = slide.backgroundTransform
            Box(Modifier.fillMaxSize()) {
                Box(Modifier.fillMaxSize().background(StorySceneFill.resolve(slide.background, slide.accentHex, floor).brush()))
                if (slide.backgroundFits) SceneBackdropLayer(slide.backdrop, slide.backgroundPosterUrl)
                StoryRestingPoster(
                    posterUrl = slide.backgroundPosterUrl,
                    thumbHash = slide.backgroundThumbHash,
                    lookRecipe = slide.lookRecipe,
                    fits = slide.backgroundFits,
                    modifier = Modifier.fillMaxSize().graphicsLayer { frame(bg) },
                )
            }
        }
        slide.imageUrl != null -> {
            val imageUrl = slide.imageUrl
            val bg = slide.backgroundTransform
            if (slide.backgroundFits) SceneBackdropLayer(slide.backdrop, imageUrl)
            AsyncImage(
                model = rememberSceneMediaModel(imageUrl, slide.composerLooks),
                contentDescription = null,
                contentScale = if (slide.backgroundFits) ContentScale.Fit else ContentScale.Crop,
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
                .background(StorySceneFill.resolve(slide.background, slide.accentHex, floor).brush()),
        )
    }
}

/**
 * Les pistes sonores de la scène : TOUTES jouent ensemble par le mixeur multipistes ([SceneAudioMixerHost]), avec leurs
 * fenêtres de temps, fondus, boucle et rognage de source, depuis l'ancre commune du playhead ([elapsedSeconds]) — entrer
 * en cours de slide ne rejoue rien depuis zéro. [muted] les ramène à 0. [lap] : le tour d'une scène rejouée en boucle.
 * [editPreview] : la scène est une composition, dont le dernier canevas monté possède le son.
 */
@Composable
internal fun StorySceneAudio(
    slide: StorySlideView,
    playing: Boolean,
    muted: Boolean,
    elapsedSeconds: () -> Double,
    lap: Int = 0,
    editPreview: Boolean = false,
    mutedTracks: Set<String> = emptySet(),
    onAudioFocusLost: () -> Unit = {},
    onAudioFocusGained: () -> Unit = {},
    onAudioFocusLostForGood: () -> Unit = {},
) {
    val gain = LocalStoryAudioGain.current
    StoryUnresolvedAudioLog(slide.id, slide.unresolvedAudioIds)
    val tracks = slide.audioTracks.ifEmpty { legacyTracks(slide) }
    if (tracks.isEmpty()) return
    val scope = remember { Any() }
    SceneAudioMixerHost(
        tracks = tracks,
        slideId = slide.id,
        elapsedSeconds = elapsedSeconds,
        playing = playing,
        muted = muted,
        mutedTrackIds = mutedTracks,
        gain = gain,
        // Une vidéo de la scène tient déjà le focus UNE fois : le mixeur n'en redemande pas (sinon la vidéo se met en pause).
        holdsAudioFocus = StorySceneAudioFocus.holder(slide) == null,
        editOwnerKey = scope.takeIf { editPreview },
        lap = lap,
        onAudioFocusLost = onAudioFocusLost,
        onAudioFocusGained = onAudioFocusGained,
        onAudioFocusLostForGood = onAudioFocusLostForGood,
    )
}

/** Une slide construite sans projecteur (témoins, anciens appelants) : ses deux URL deviennent deux pistes. */
private fun legacyTracks(slide: StorySlideView): List<SceneAudioTrack> = listOfNotNull(
    slide.backgroundAudioUrl?.let {
        SceneAudioTrack("legacy-bg-audio", it, isBackground = true, loop = slide.backgroundLoop, window = slide.backgroundAudioWindow)
    },
    slide.foregroundAudioUrl?.let {
        SceneAudioTrack("legacy-fg-audio", it, isBackground = false, loop = false, window = slide.foregroundAudioWindow)
    },
)

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
 *
 * [floor] : ce qui se lit sous une scène sans fond. Un réel pose la sienne sur du NOIR (iOS `ReelCardSceneBackdrop` et lecteur de
 * réels) ; une story garde le dégradé d'auteur.
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
    floor: SceneFloor = SceneFloor.AUTHOR_GRADIENT,
    editPreview: Boolean = false,
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
    var started by remember(slide.id) { mutableStateOf(false) }
    if (playing) started = true
    val totalSeconds = durationMs / 1000.0
    val rootTransition = if (resting || !started) null else SceneRootTransitionSpec(
        opening = slide.opening,
        closing = slide.closing,
        totalDurationSeconds = totalSeconds,
        restartKey = slide.id to lap,
        playing = playing,
    )
    Box(modifier.fillMaxSize().background(if (floor == SceneFloor.BLACK) Color.Black else hexColor(slide.accentHex))) {
        Box(Modifier.fillMaxSize().sceneRootTransition(rootTransition) { progress.value * totalSeconds }) {
            StorySceneBackground(
                slide = slide,
                playing = playing,
                muted = muted,
                loads = loads,
                rewindWhenInactive = rewindWhenIdle,
                onAudioFocusLost = onAudioFocusLost,
                onBackgroundPlayer = onBackgroundPlayer,
                stillFrame = resting,
                floor = floor,
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
                if (!resting) {
                    StorySceneAudio(
                        slide = slide,
                        playing = playing,
                        muted = muted,
                        elapsedSeconds = { progress.value * totalSeconds },
                        lap = lap,
                        editPreview = editPreview,
                        onAudioFocusLost = onAudioFocusLost,
                    )
                }
            }
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
