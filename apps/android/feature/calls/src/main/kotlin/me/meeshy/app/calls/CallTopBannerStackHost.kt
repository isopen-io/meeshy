package me.meeshy.app.calls

import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.AnimationVector1D
import androidx.compose.animation.core.animateDpAsState
import androidx.compose.animation.core.snap
import androidx.compose.animation.core.tween
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.systemBarsPadding
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.State
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.compositionLocalOf
import androidx.compose.runtime.derivedStateOf
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableStateMapOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.setValue
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.layout.layout
import androidx.compose.ui.layout.onSizeChanged
import androidx.compose.ui.layout.positionInParent
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.launch
import me.meeshy.sdk.model.call.CallChromeStow
import me.meeshy.sdk.model.call.CallTopBanner
import me.meeshy.sdk.model.call.CallTopBannerStack
import me.meeshy.sdk.model.call.screenshare.CallScreenSharePhase

/**
 * P16.4 — la pile des bandeaux du haut (partage, enregistrement, capture, cadre) : UNE colonne ancrée SOUS la rangée
 * d'en-tête, dans l'ordre de [CallTopBannerStack], au lieu de la rangée de l'en-tête elle-même. [modifier] place la pile
 * (l'écran choisit le bord) ; chaque bandeau porte sa propre marge et son écart du dessus.
 */
@Composable
internal fun CallTopBannerStackHost(registry: CallOverlayRegistry, context: CallOverlayContext, modifier: Modifier = Modifier) {
    CallOverlaySlotHost(
        registry,
        CallOverlaySlot.TopBanner,
        context,
        modifier.systemBarsPadding().fillMaxWidth().padding(top = CallTopBannerStack.HEADER_ROW_DP.dp),
    )
}

private class HeldFace<T : Any>(var value: T? = null)

/**
 * P16.6 · R1.6 · R2.10 · L1.9 — la présence d'un bandeau de la pile : il arrive du haut, en fondu, et y repart quand [face] devient
 * `null`. Il ne se déplace que par la transformation et l'opacité (`graphicsLayer`, lues au dessin : aucune recomposition,
 * aucune remesure de la pile à chaque image). Sa place, elle, ne change qu'une fois par mouvement : entière dès l'arrivée, rendue
 * dès le départ ([CallTopBannerStack.keepsPlaceWhileLeaving]), si bien que les bandeaux voisins ([glidesToItsPlace]) referment la
 * pile PENDANT qu'il monte, au même rythme, sans trou ni saut. « Réduire les animations » : un fondu court, sans déplacement, et le
 * bandeau garde sa place jusqu'au bout. Le dernier visage reste le temps de la sortie, pour que le texte ne saute pas pendant que
 * le bandeau repart. [travels] faux : un habit qui ne se déplace pas (le cadre en direct autour des deux vidéos, #17820 C3.6)
 * n'en garde que le fondu.
 */
@Composable
internal fun <T : Any> CallBannerPresence(face: T?, travels: Boolean = true, content: @Composable (T) -> Unit) {
    val held = remember { HeldFace<T>() }
    if (face != null) held.value = face
    val reduceMotion = rememberCallReduceMotion()
    val millis = CallChromeStow.fadeMillis(reduceMotion)
    val towardTop = travels && CallTopBannerStack.leavesTowardTop(reduceMotion)
    val shown = face != null
    val progress = remember { Animatable(if (shown) 1f else 0f) }
    var settledGone by remember { mutableStateOf(!shown) }
    LaunchedEffect(shown, millis) {
        if (shown) {
            settledGone = false
            progress.animateTo(1f, tween(millis))
        } else {
            progress.animateTo(0f, tween(millis))
            settledGone = true
        }
    }
    if (!shown && settledGone) return
    (face ?: held.value)?.let { visible ->
        Box(
            Modifier
                .yieldsItsPlace(!shown && !CallTopBannerStack.keepsPlaceWhileLeaving(travels, reduceMotion))
                .glidesToItsPlace(enabled = towardTop)
                .graphicsLayer {
                    alpha = progress.value
                    translationY = if (towardTop) CallTopBannerStack.presenceTranslationFraction(progress.value, travels = true) * size.height else 0f
                },
        ) { content(visible) }
    }
}

/** Un bandeau qui repart rend sa place à la pile d'UNE mise en page, et se dessine encore entier le temps de monter. */
private fun Modifier.yieldsItsPlace(yields: Boolean): Modifier = layout { measurable, constraints ->
    val placeable = measurable.measure(constraints)
    layout(placeable.width, if (yields) 0 else placeable.height) { placeable.place(0, 0) }
}

/** La place où l'œil voit un bandeau : elle rejoint sa place mise en page par un glissement, sans jamais sauter. */
private class GlidingTop {
    var shown: Animatable<Float, AnimationVector1D>? = null
}

/**
 * L1.9 — un bandeau dont la place change parce qu'un autre, au-dessus, arrive ou repart ne saute pas : il se dessine là où
 * l'œil le voyait ([CallTopBannerStack.glideTranslationPx]) et glisse jusqu'à sa place par une transformation lue au dessin.
 * Sa nouvelle place est lue AU PLACEMENT (`coordinates`, que Compose rejoue dès que le parent le déplace) et la translation
 * part dans la même image : aucune image ne le montre à sa nouvelle place avant le glissement. Désactivé ([enabled] faux, sous
 * « Réduire les animations » ou pour un habit qui ne voyage pas), il rejoint sa place d'un coup.
 */
@Composable
internal fun Modifier.glidesToItsPlace(enabled: Boolean): Modifier {
    val glide = remember { GlidingTop() }
    val scope = rememberCoroutineScope()
    val millis = CallChromeStow.fadeMillis(reduceMotion = false)
    if (!enabled) {
        glide.shown = null
        return this
    }
    return layout { measurable, constraints ->
        val placeable = measurable.measure(constraints)
        layout(placeable.width, placeable.height) {
            val placedTop = coordinates?.positionInParent()?.y
            val shown = glide.shown
            when {
                placedTop == null -> Unit
                shown == null -> glide.shown = Animatable(placedTop)
                shown.targetValue != placedTop -> scope.launch { shown.animateTo(placedTop, tween(millis)) }
            }
            val now = glide.shown
            placeable.placeWithLayer(0, 0) {
                translationY = if (now == null || placedTop == null) 0f else CallTopBannerStack.glideTranslationPx(now.value, placedTop)
            }
        }
    }
}

/**
 * R1.5 — la hauteur RÉELLE de chaque bandeau de la pile, rendue par les bandeaux eux-mêmes ([reportsTopBannerHeight]) à
 * l'écran d'appel, qui en déduit la place de ma vignette : la carte d'accord est plus haute qu'une capsule.
 */
internal class CallTopBannerHeights {
    private val heightsDp = mutableStateMapOf<CallTopBanner, Float>()
    private val owners = mutableMapOf<CallTopBanner, Any>()

    /** [owner] : celui qui dit la mesure — la carte d'accord et la capsule d'enregistrement tiennent le même rang. */
    fun report(banner: CallTopBanner, heightDp: Float, owner: Any) {
        owners[banner] = owner
        if (heightsDp[banner] != heightDp) heightsDp[banner] = heightDp
    }

    /**
     * Un bandeau qui quitte la composition s'oublie : sa mesure ne tient plus la place de personne. Seul celui qui a dit la
     * mesure en vigueur l'efface ; un autre du même rang, parti après avoir été relayé, ne l'emporte pas avec lui.
     */
    fun forget(banner: CallTopBanner, owner: Any) {
        if (owners[banner] !== owner) return
        owners.remove(banner)
        heightsDp.remove(banner)
    }

    fun isReported(banner: CallTopBanner): Boolean = heightsDp.containsKey(banner)

    fun snapshot(): Map<CallTopBanner, Float> = heightsDp.toMap()
}

internal val LocalCallTopBannerHeights = staticCompositionLocalOf<CallTopBannerHeights?> { null }

/** Le bandeau dit sa hauteur (sans l'écart du dessus) à la pile ; hors d'un écran d'appel, il ne dit rien. */
@Composable
internal fun Modifier.reportsTopBannerHeight(banner: CallTopBanner): Modifier {
    val heights = LocalCallTopBannerHeights.current ?: return this
    val density = LocalDensity.current
    val owner = remember { Any() }
    DisposableEffect(heights, banner) { onDispose { heights.forget(banner, owner) } }
    return onSizeChanged { heights.report(banner, with(density) { it.height.toDp().value }, owner) }
}

private val NoClearance: State<Dp> = object : State<Dp> {
    override val value: Dp = 0.dp
}

/**
 * P16.8 — la place que la pile prend sous l'en-tête : ma vignette s'y range dessous, sans être recouverte. Un état LU par la
 * vignette seule, pas par l'écran : le glissement ne recompose pas tout l'appel à chaque image.
 */
internal val LocalCallSelfTileBannerClearance = compositionLocalOf<State<Dp>> { NoClearance }

/**
 * La place que la pile prend sous l'en-tête pour LA GRILLE de groupe (L4.11), en deux lectures : [layout], lue à la mesure par
 * la réserve haute et qui ne change qu'une fois par mouvement, et [shift], lu au dessin par la grille, qui la fait glisser
 * image par image sans la remesurer.
 */
internal class CallGroupGridClearance(private val layoutDp: State<Float>, private val shownDp: State<Float>) {
    val layout: Dp get() = layoutDp.value.dp

    val shift: Dp get() = CallTopBannerStack.groupGridShiftDp(shownDp.value, layoutDp.value).dp
}

private val NoGridShift: State<Float> = object : State<Float> {
    override val value: Float = 0f
}

internal val LocalCallGroupGridClearance = compositionLocalOf { CallGroupGridClearance(NoGridShift, NoGridShift) }

/** Mon partage et l'enregistrement : les deux bandeaux dont l'état vit dans un modèle de vue et non dans l'état de l'appel. */
private class LocalBannerFlags(val isSharing: Boolean, val isRecordingShown: Boolean)

@Composable
private fun rememberLocalBannerFlags(): LocalBannerFlags {
    val share: CallScreenShareViewModel = hiltViewModel()
    val recording: CallRecordingViewModel = hiltViewModel()
    val sharing by remember(share) { share.state.map { it.phase == CallScreenSharePhase.Sharing }.distinctUntilChanged() }
        .collectAsState(initial = false)
    val recordingShown by recording.isBannerShown.collectAsState()
    return LocalBannerFlags(sharing, recordingShown)
}

/** Le glissement de la place laissée par la pile : transformation seule, un saut net sous « Réduire les animations ». */
private fun bannerClearanceSpec(reduceMotion: Boolean) =
    if (reduceMotion) snap<Dp>() else tween<Dp>(CallChromeStow.fadeMillis(reduceMotion = false))

/**
 * Le dégagement de ma vignette sous la pile : MON partage, l'enregistrement (carte, capsule, avis) et la capsule de capture
 * comptent chacun leur hauteur mesurée (un partage reçu ne touche pas sa place, #17730) ; il glisse avec les bandeaux —
 * transformation seule, un saut net sous « Réduire les animations ».
 */
@Composable
internal fun rememberSelfTileBannerClearance(heights: CallTopBannerHeights, isCaptureAlertShown: Boolean, reduceMotion: Boolean): State<Dp> {
    val flags = rememberLocalBannerFlags()
    val counted = CallTopBannerStack.countedForSelfTile(flags.isSharing, flags.isRecordingShown, isCaptureAlertShown)
    val target = CallTopBannerStack.selfTileClearanceDp(counted, heights.snapshot()).dp
    return animateDpAsState(target, bannerClearanceSpec(reduceMotion), label = "callSelfTileBannerClearance")
}

/**
 * L4.11 — la place que la grille de groupe cède à la pile : tous les bandeaux présents comptent (un partage reçu aussi, le cadre
 * en direct aussi), chacun à sa hauteur mesurée ; plein écran, la pile est rangée et la grille reprend tout. La grille glisse
 * avec les bandeaux par sa seule translation ([CallGroupGridClearance.shift]) et ne se remet en page qu'une fois par mouvement
 * ([CallTopBannerStack.groupGridLayoutClearanceDp]) : ni ses vignettes ni leurs vidéos ne se remesurent à chaque image.
 */
@Composable
internal fun rememberGroupGridBannerClearance(
    heights: CallTopBannerHeights,
    isPeerScreenSharing: Boolean,
    isCaptureAlertShown: Boolean,
    isStageFullScreen: Boolean,
    reduceMotion: Boolean,
): CallGroupGridClearance {
    val flags = rememberLocalBannerFlags()
    val present = CallTopBannerStack.present(
        isScreenShareShown = flags.isSharing || isPeerScreenSharing,
        isRecordingShown = flags.isRecordingShown,
        isCaptureAlertShown = isCaptureAlertShown,
        isLiveFrameShown = heights.isReported(CallTopBanner.LiveFrame),
    )
    val target = CallTopBannerStack.groupGridClearanceDp(present, heights.snapshot(), isStageFullScreen)
    val targetNow = rememberUpdatedState(target)
    val shown = remember { Animatable(target) }
    val settled = remember { mutableFloatStateOf(target) }
    LaunchedEffect(target, reduceMotion) {
        if (reduceMotion) shown.snapTo(target) else shown.animateTo(target, tween(CallChromeStow.fadeMillis(reduceMotion = false)))
        settled.floatValue = target
    }
    return remember(shown, settled, targetNow) {
        CallGroupGridClearance(
            layoutDp = derivedStateOf { CallTopBannerStack.groupGridLayoutClearanceDp(settled.floatValue, targetNow.value) },
            shownDp = shown.asState(),
        )
    }
}
