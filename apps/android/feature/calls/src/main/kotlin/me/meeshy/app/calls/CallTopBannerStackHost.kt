package me.meeshy.app.calls

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.EnterTransition
import androidx.compose.animation.ExitTransition
import androidx.compose.animation.core.animateDpAsState
import androidx.compose.animation.core.snap
import androidx.compose.animation.core.tween
import androidx.compose.animation.expandVertically
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.shrinkVertically
import androidx.compose.animation.slideInVertically
import androidx.compose.animation.slideOutVertically
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.systemBarsPadding
import androidx.compose.runtime.Composable
import androidx.compose.runtime.State
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.compositionLocalOf
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateMapOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.Modifier
import androidx.compose.ui.layout.onSizeChanged
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.map
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
 * P16.6 · R1.6 · R2.10 — la présence d'un bandeau de la pile : il arrive du haut, en fondu, et y repart quand [face] devient
 * `null`, pendant que les bandeaux suivants glissent à sa place. « Réduire les animations » : un fondu court, sans déplacement.
 * Le dernier visage reste le temps de la sortie, pour que le texte ne saute pas pendant que le bandeau repart.
 * [travels] faux : un habit qui ne se déplace pas (le cadre en direct autour des deux vidéos, #17820 C3.6) n'en garde que
 * le fondu.
 */
@Composable
internal fun <T : Any> CallBannerPresence(face: T?, travels: Boolean = true, content: @Composable (T) -> Unit) {
    val held = remember { HeldFace<T>() }
    if (face != null) held.value = face
    val reduceMotion = rememberCallReduceMotion()
    val millis = CallChromeStow.fadeMillis(reduceMotion)
    val towardTop = travels && CallTopBannerStack.leavesTowardTop(reduceMotion)
    AnimatedVisibility(
        visible = face != null,
        enter = fadeIn(tween(millis)) + if (towardTop) {
            slideInVertically(tween(millis)) { -it } + expandVertically(tween(millis))
        } else {
            EnterTransition.None
        },
        exit = fadeOut(tween(millis)) + if (towardTop) {
            slideOutVertically(tween(millis)) { -it } + shrinkVertically(tween(millis))
        } else {
            ExitTransition.None
        },
    ) {
        (face ?: held.value)?.let { content(it) }
    }
}

/**
 * R1.5 — la hauteur RÉELLE de chaque bandeau de la pile, rendue par les bandeaux eux-mêmes ([reportsTopBannerHeight]) à
 * l'écran d'appel, qui en déduit la place de ma vignette : la carte d'accord est plus haute qu'une capsule.
 */
internal class CallTopBannerHeights {
    private val heightsDp = mutableStateMapOf<CallTopBanner, Float>()

    fun report(banner: CallTopBanner, heightDp: Float) {
        if (heightsDp[banner] != heightDp) heightsDp[banner] = heightDp
    }

    fun snapshot(): Map<CallTopBanner, Float> = heightsDp.toMap()
}

internal val LocalCallTopBannerHeights = staticCompositionLocalOf<CallTopBannerHeights?> { null }

/** Le bandeau dit sa hauteur (sans l'écart du dessus) à la pile ; hors d'un écran d'appel, il ne dit rien. */
@Composable
internal fun Modifier.reportsTopBannerHeight(banner: CallTopBanner): Modifier {
    val heights = LocalCallTopBannerHeights.current ?: return this
    val density = LocalDensity.current
    return onSizeChanged { heights.report(banner, with(density) { it.height.toDp().value }) }
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
 * Le dégagement de ma vignette sous la pile : MON partage, l'enregistrement (carte, capsule, avis) et la capsule de capture
 * comptent chacun leur hauteur mesurée (un partage reçu ne touche pas sa place, #17730) ; il glisse avec les bandeaux —
 * transformation seule, un saut net sous « Réduire les animations ».
 */
@Composable
internal fun rememberSelfTileBannerClearance(heights: CallTopBannerHeights, isCaptureAlertShown: Boolean, reduceMotion: Boolean): State<Dp> {
    val share: CallScreenShareViewModel = hiltViewModel()
    val recording: CallRecordingViewModel = hiltViewModel()
    val sharing by remember(share) { share.state.map { it.phase == CallScreenSharePhase.Sharing }.distinctUntilChanged() }
        .collectAsState(initial = false)
    val recordingShown by recording.isBannerShown.collectAsState()
    val counted = CallTopBannerStack.countedForSelfTile(sharing, recordingShown, isCaptureAlertShown)
    val target = CallTopBannerStack.selfTileClearanceDp(counted, heights.snapshot()).dp
    val spec = if (reduceMotion) snap<Dp>() else tween<Dp>(CallChromeStow.fadeMillis(reduceMotion = false))
    return animateDpAsState(target, spec, label = "callSelfTileBannerClearance")
}
