package me.meeshy.ui.component.lottie

import androidx.compose.foundation.layout.Box
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.State
import androidx.compose.runtime.compositionLocalOf
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.produceState
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.layout.boundsInWindow
import androidx.compose.ui.layout.findRootCoordinates
import androidx.compose.ui.layout.onGloballyPositioned
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.compose.LocalLifecycleOwner
import androidx.lifecycle.compose.currentStateAsState
import com.airbnb.lottie.compose.LottieAnimation
import com.airbnb.lottie.compose.LottieConstants
import com.airbnb.lottie.compose.animateLottieCompositionAsState
import me.meeshy.sdk.model.media.LottieLayerPlayback
import me.meeshy.sdk.model.media.LottieLiveBudget
import me.meeshy.sdk.model.media.LottiePlaybackMode
import me.meeshy.sdk.model.pack.PackAssetRef
import me.meeshy.ui.accessibility.LocalReduceMotion

/** Le budget de la session : huit films vivants, toutes surfaces confondues. */
public object LottieBudgets {
    public val shared: LottieLiveBudget = LottieLiveBudget(LottieLiveBudget.MAX_LIVE_LAYERS)
}

/** La source des films de pack, fournie par l'app ; absente ⇒ les couches s'effacent (couture inerte). */
public val LocalLottieLayerSource = compositionLocalOf<LottieLayerSource?> { null }

/**
 * **Une couche animée posée sur un design** (fond, bannière, contour d'avatar) — miroir de `LottieLayerView` (iOS).
 * [contentScale] : `Crop` pour un fond ou une bannière, `Fit` pour un contour. La loi de lecture est
 * [LottieLayerPlayback] ; le budget des films vivants est [LottieBudgets.shared]. Transparente aux touchers et muette
 * pour TalkBack : un décor ne change ni la cible qu'il couvre ni ce que l'on lit.
 */
@Composable
public fun LottieLayerView(
    film: LottieFilm,
    modifier: Modifier = Modifier,
    animates: Boolean = true,
    contentScale: ContentScale = ContentScale.Fit,
    loops: Boolean = true,
    budget: LottieLiveBudget = LottieBudgets.shared,
) {
    val reduceMotion = LocalReduceMotion.current
    val lifecycleState by LocalLifecycleOwner.current.lifecycle.currentStateAsState()
    var onScreen by remember { mutableStateOf(false) }
    val mayPlay = animates && !reduceMotion
    val granted by rememberLottieSlot(budget, wants = onScreen && mayPlay)
    val mode = LottieLayerPlayback.mode(
        animates = animates && granted,
        reduceMotion = reduceMotion,
        sceneActive = lifecycleState.isAtLeast(Lifecycle.State.STARTED),
        onScreen = onScreen,
        loops = loops,
    )
    val state = animateLottieCompositionAsState(
        composition = film.composition,
        isPlaying = mode is LottiePlaybackMode.Playing,
        iterations = if (mode is LottiePlaybackMode.Playing && !mode.loops) 1 else LottieConstants.IterateForever,
        restartOnPlay = false,
    )
    val still = mode == LottiePlaybackMode.FirstFrame
    LottieAnimation(
        composition = film.composition,
        progress = { if (still) 0f else state.progress },
        modifier = modifier
            .onGloballyPositioned { onScreen = it.isAttached && it.boundsInWindow().overlaps(it.findRootCoordinates().boundsInWindow()) }
            .clearAndSetSemantics { },
        contentScale = contentScale,
    )
}

@Composable
private fun rememberLottieSlot(budget: LottieLiveBudget, wants: Boolean): State<Boolean> {
    val live = remember(budget) { mutableStateOf(false) }
    val ticket = remember(budget) { intArrayOf(-1) }
    DisposableEffect(budget) {
        ticket[0] = budget.claim(grant = { live.value = true }, evict = { live.value = false })
        onDispose {
            budget.release(ticket[0])
            live.value = false
        }
    }
    DisposableEffect(budget, wants) {
        budget.setVisible(ticket[0], wants)
        onDispose { }
    }
    return live
}

/**
 * **La couche d'un fichier de pack** : lit le film via [LocalLottieLayerSource] hors du fil principal, puis le monte.
 * Tant que le film n'est pas là, ou s'il est illisible, ou sans source fournie, la vue est vide : le dessin dessous
 * porte seul le rendu.
 */
@Composable
public fun PackLottieLayer(
    ref: PackAssetRef?,
    modifier: Modifier = Modifier,
    animates: Boolean = true,
    contentScale: ContentScale = ContentScale.Fit,
    loops: Boolean = true,
) {
    val source = LocalLottieLayerSource.current
    val film by produceState<LottieFilm?>(initialValue = if (ref != null) source?.cached(ref) else null, ref, source) {
        value = if (ref == null || source == null) null else source.cached(ref) ?: source.film(ref)
    }
    val loaded = film
    if (loaded == null) {
        Box(modifier.clearAndSetSemantics { })
    } else {
        LottieLayerView(loaded, modifier, animates, contentScale, loops)
    }
}

/** Fournit la source des films de pack à un sous-arbre. */
@Composable
public fun ProvideLottieLayerSource(source: LottieLayerSource?, content: @Composable () -> Unit) {
    CompositionLocalProvider(LocalLottieLayerSource provides source, content = content)
}
