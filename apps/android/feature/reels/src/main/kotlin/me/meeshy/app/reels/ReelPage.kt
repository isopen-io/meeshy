package me.meeshy.app.reels

import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.background
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.pager.rememberPagerState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.mutableLongStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.unit.dp
import coil.compose.AsyncImage
import me.meeshy.app.stories.SceneFloor
import me.meeshy.app.stories.StoryScenePlayer
import me.meeshy.sdk.model.PostReactionPick
import me.meeshy.sdk.model.ReelContentTap
import me.meeshy.sdk.model.playback.PipAspect
import me.meeshy.sdk.model.playback.VideoPresentation
import me.meeshy.sdk.theme.DynamicColorGenerator
import me.meeshy.ui.component.fullscreen.FullscreenChromeDimens
import me.meeshy.ui.component.fullscreen.FullscreenChromeVisibility
import me.meeshy.ui.component.fullscreen.FullscreenPlayPauseButton
import me.meeshy.ui.component.fullscreen.rememberFullscreenPlayPauseFade
import me.meeshy.ui.component.video.ReelPlayerHandle
import me.meeshy.ui.component.video.ReelVideoSurface
import me.meeshy.ui.component.video.rememberVideoPictureInPicture
import me.meeshy.ui.haptics.rememberMeeshyHaptics
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.hexColor

/**
 * Une page du fil de réels (iOS `ReelPageView`). Elle reçoit des PRIMITIVES — élue, posée, charge
 * son média, chrome masqué — et jamais l'état du pager : seules les deux pages qu'une élection
 * touche se recomposent, et la progression de lecture ne recompose rien (voir [ReelScrubBar]).
 *
 * Gestes sur le contenu, un seul détecteur : un toucher bascule lecture/pause (ou ne fait que
 * RENDRE le chrome quand il est masqué), un appui long entre en mode immersif (tout le chrome
 * s'efface). Le carrousel de photos garde son glissement horizontal, le pager le vertical.
 */
@OptIn(ExperimentalFoundationApi::class)
@Composable
internal fun ReelPage(
    reel: ReelPresentation,
    isElected: Boolean,
    isEngaged: Boolean,
    loadsMedia: Boolean,
    muted: Boolean,
    onSoundProbed: (Boolean) -> Unit,
    chromeHidden: Boolean,
    isOwn: Boolean,
    quickEmojis: List<String>,
    railActions: ReelRailActions,
    onChromeHidden: (Boolean) -> Unit,
    onOpenAuthor: ((String) -> Unit)?,
    modifier: Modifier = Modifier,
) {
    val haptics = rememberMeeshyHaptics()
    val stage = reel.stage
    val scene = reel.scene
    val hasPlayable = stage.playableUrl != null || scene != null
    var paused by rememberSaveable(reel.id) { mutableStateOf(false) }
    var player by remember { mutableStateOf<ReelPlayerHandle?>(null) }
    // Position gardée quand le lecteur est libéré sans que la page cesse d'être élue (app en
    // arrière-plan) : le lecteur recréé au retour y reprend. Une page quittée repart de zéro.
    var resumeAtMs by rememberSaveable(reel.id) { mutableLongStateOf(0L) }
    val imagesState = rememberPagerState(pageCount = { reel.imageUrls.size })
    val showsCarousel = !stage.showsVideoSurface && reel.imageUrls.size > 1
    val accent = hexColor(DynamicColorGenerator.colorForName(reel.authorName ?: reel.id), MeeshyPalette.Indigo500)
    val currentChromeHidden by rememberUpdatedState(chromeHidden)
    val currentOnChromeHidden by rememberUpdatedState(onChromeHidden)

    val currentOnSoundProbed by rememberUpdatedState(onSoundProbed)
    // Le bouton muet attend la sonde : la piste audio de la vidéo, lue par le lecteur lui-même.
    DisposableEffect(player) {
        val stop = player?.observeAudioTrack { currentOnSoundProbed(it) }
        onDispose { stop?.invoke() }
    }

    LaunchedEffect(isElected) {
        if (!isElected) {
            paused = false
            resumeAtMs = 0L
        }
    }

    val isPlaying = isElected && !paused && hasPlayable
    // Le réel vidéo affiché part en Picture-in-Picture en quittant l'app (#13814) ; fermer la fenêtre le met en pause.
    rememberVideoPictureInPicture(
        presentation = VideoPresentation.FULLSCREEN,
        isProtected = false,
        player = player,
        fallback = PipAspect.PORTRAIT,
        active = isElected && stage.showsVideoSurface,
        onWindowClosed = { paused = true },
    )
    val playPauseFade = rememberFullscreenPlayPauseFade(isPlaying)

    Box(modifier.fillMaxSize().background(Color.Black)) {
        Box(
            Modifier
                .fillMaxSize()
                .pointerInput(hasPlayable) {
                    detectTapGestures(
                        onLongPress = {
                            if (!currentChromeHidden) {
                                haptics.medium()
                                currentOnChromeHidden(true)
                            }
                        },
                        onTap = {
                            when (ReelContentTap.outcome(currentChromeHidden, hasPlayable)) {
                                ReelContentTap.Outcome.RESTORE_CHROME -> currentOnChromeHidden(false)
                                ReelContentTap.Outcome.TOGGLE_PLAYBACK -> {
                                    haptics.light()
                                    paused = !paused
                                    playPauseFade.onMediaTap()
                                }
                                ReelContentTap.Outcome.NONE -> Unit
                            }
                        },
                    )
                },
        ) {
            if (scene != null) {
                // La scène du réel : le rendu du lecteur de stories, rejoué en boucle, son compris.
                StoryScenePlayer(
                    slide = scene,
                    playing = isPlaying && loadsMedia,
                    muted = muted,
                    loads = loadsMedia,
                    rewindWhenIdle = !isElected,
                    onAudioFocusLost = { paused = true },
                    // La vidéo de fond de la scène se sonde comme celle d'un réel simple : le bouton muet l'attend.
                    onBackgroundPlayer = { handle -> player = handle },
                    modifier = Modifier.fillMaxSize(),
                    floor = SceneFloor.BLACK,
                )
            } else ReelMedia(
                reel = reel,
                stage = stage,
                accent = accent,
                showsCarousel = showsCarousel,
                imagesState = imagesState,
            )
            stage.playableUrl?.let { playable ->
                ReelVideoSurface(
                    mediaUrl = playable,
                    isActive = isElected,
                    modifier = Modifier.fillMaxSize(),
                    muted = muted,
                    showsPicture = stage.showsVideoSurface,
                    loads = loadsMedia,
                    paused = paused,
                    // Un vocal ou un appel a pris le son : le réel reste en pause, comme après un toucher.
                    onAudioFocusLost = { paused = true },
                    onPlayer = { handle ->
                        if (handle == null) {
                            resumeAtMs = player?.positionMs() ?: resumeAtMs
                        } else if (resumeAtMs > 0L) {
                            handle.seekTo(resumeAtMs)
                        }
                        player = handle
                    },
                    fit = true,
                )
            }
        }

        if (hasPlayable && isElected) {
            FullscreenPlayPauseButton(
                isPlaying = isPlaying,
                visible = playPauseFade.isVisible && !chromeHidden,
                onToggle = {
                    haptics.light()
                    paused = !paused
                },
                modifier = Modifier.align(Alignment.Center),
            )
        }

        FullscreenChromeVisibility(visible = !chromeHidden, modifier = Modifier.fillMaxSize()) {
            if (showsCarousel) {
                ReelImageCounter(
                    current = imagesState.currentPage,
                    total = reel.imageUrls.size,
                    modifier = Modifier
                        .align(Alignment.TopEnd)
                        .statusBarsPadding()
                        .padding(top = FullscreenChromeDimens.tapTarget + MeeshySpacing.md, end = MeeshySpacing.lg),
                )
            }
            Column(
                Modifier
                    .align(Alignment.BottomCenter)
                    .fillMaxWidth()
                    .navigationBarsPadding()
                    .padding(horizontal = FullscreenChromeDimens.edgeInset)
                    .padding(bottom = MeeshySpacing.md),
                verticalArrangement = Arrangement.spacedBy(MeeshySpacing.md),
            ) {
                Row(verticalAlignment = Alignment.Bottom, horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.md)) {
                    ReelInfo(
                        reel = reel,
                        isOwn = isOwn,
                        onOpenAuthor = reel.authorId?.let { id -> onOpenAuthor?.let { open -> { open(id) } } },
                        modifier = Modifier.weight(1f),
                    )
                    ReelRail(reel = reel, quickEmojis = quickEmojis, actions = railActions)
                }
                if (isEngaged && stage.playableUrl != null) {
                    ReelScrubBar(player = player, accent = accent)
                }
            }
        }
    }
}

/** Le fond de la page : la vidéo posée sur son poster flouté, les photos, ou la toile d'un audio sans pochette. */
@OptIn(ExperimentalFoundationApi::class)
@Composable
private fun ReelMedia(
    reel: ReelPresentation,
    stage: ReelStage,
    accent: Color,
    showsCarousel: Boolean,
    imagesState: androidx.compose.foundation.pager.PagerState,
) {
    when {
        stage.showsVideoSurface -> reel.posterUrl?.let { poster ->
            ReelBlurredFill(poster)
            AsyncImage(
                model = poster,
                contentDescription = null,
                contentScale = ContentScale.Fit,
                modifier = Modifier.fillMaxSize(),
            )
        }
        showsCarousel -> ReelImageCarousel(imageUrls = reel.imageUrls, state = imagesState)
        else -> when (val backdrop = stage.backdrop) {
            is ReelBackdrop.Picture -> {
                ReelBlurredFill(backdrop.url)
                AsyncImage(
                    model = backdrop.url,
                    contentDescription = null,
                    contentScale = ContentScale.Fit,
                    modifier = Modifier.fillMaxSize(),
                )
            }
            ReelBackdrop.AudioCanvas -> ReelAudioCanvas(accent = accent, modifier = Modifier.fillMaxSize())
            ReelBackdrop.None -> Unit
        }
    }
}
