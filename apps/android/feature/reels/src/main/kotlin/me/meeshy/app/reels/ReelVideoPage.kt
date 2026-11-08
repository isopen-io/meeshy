package me.meeshy.app.reels

import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.tween
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.RectangleShape
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.layout.ContentScale
import coil.compose.AsyncImage
import me.meeshy.sdk.model.ReelChromeState
import me.meeshy.sdk.model.ReelPosterPhase
import me.meeshy.ui.accessibility.LocalReduceMotion
import me.meeshy.ui.component.MeeshySkeletonBox
import me.meeshy.ui.component.video.ReelPlayerHandle
import me.meeshy.ui.component.video.ReelVideoSurface

/**
 * La page vidéo d'un réel : un shimmer tant que rien n'est arrivé, le poster dès qu'il est chargé, puis la
 * vidéo qui prend le relais — le poster s'efface en fondu (0,25 s ; coupe sèche sous « Réduire les animations »)
 * au PREMIER plan réellement lu, pas à l'ouverture du lecteur.
 *
 * **Cadrage.** La vidéo tient en entier dans la page (`fit`, iOS `resizeAspect`) posée sur son poster flouté
 * ([ReelBlurredFill]) : un plan paysage n'a pas de bande noire, ses marges sont de l'image floutée, et rien du
 * plan n'est rogné — le choix du crop est réservé à la scène, qui compose son propre cadre.
 * La vidéo boucle (le moteur la rejoue) et ne joue que si [playing] : élue, révélée, hors appel, non pausée.
 */
@Composable
internal fun ReelVideoPage(
    posterUrl: String?,
    mediaUrl: String,
    isElected: Boolean,
    loadsMedia: Boolean,
    muted: Boolean,
    playing: Boolean,
    onPlayer: (ReelPlayerHandle?) -> Unit,
    onAudioFocusLost: () -> Unit,
    onAudioFocusGained: () -> Unit,
    onAudioFocusLostForGood: () -> Unit,
    modifier: Modifier = Modifier,
) {
    var posterLoaded by remember(mediaUrl) { mutableStateOf(false) }
    var firstFrameShown by remember(mediaUrl) { mutableStateOf(false) }
    val phase = ReelPosterPhase.of(hasPoster = posterUrl != null, posterLoaded = posterLoaded, firstFrameShown = firstFrameShown)
    val reduceMotion = LocalReduceMotion.current
    val posterAlpha by animateFloatAsState(
        targetValue = if (phase == ReelPosterPhase.VIDEO) 0f else 1f,
        animationSpec = tween(durationMillis = if (reduceMotion) 0 else ReelChromeState.FADE_MILLIS),
        label = "reel-poster-fade",
    )
    Box(modifier.fillMaxSize()) {
        if (phase == ReelPosterPhase.SHIMMER) {
            MeeshySkeletonBox(Modifier.fillMaxSize(), shape = RectangleShape)
        }
        ReelVideoSurface(
            mediaUrl = mediaUrl,
            isActive = isElected,
            modifier = Modifier.fillMaxSize(),
            muted = muted,
            showsPicture = true,
            loads = loadsMedia,
            paused = !playing,
            onAudioFocusLost = onAudioFocusLost,
            onAudioFocusGained = onAudioFocusGained,
            onAudioFocusLostForGood = onAudioFocusLostForGood,
            onFirstFrame = { firstFrameShown = true },
            onPlayer = onPlayer,
            fit = true,
        )
        if (posterUrl != null && posterAlpha > 0f) {
            Box(Modifier.fillMaxSize().graphicsLayer { alpha = posterAlpha }) {
                ReelBlurredFill(posterUrl)
                AsyncImage(
                    model = posterUrl,
                    contentDescription = null,
                    contentScale = ContentScale.Fit,
                    onSuccess = { posterLoaded = true },
                    modifier = Modifier.fillMaxSize(),
                )
            }
        }
    }
}
