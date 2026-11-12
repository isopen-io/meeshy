package me.meeshy.app.calls

import androidx.compose.animation.core.animateDpAsState
import androidx.compose.animation.core.snap
import androidx.compose.animation.core.tween
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.systemBarsPadding
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.compositionLocalOf
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import me.meeshy.sdk.model.call.CallChromeStow
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

/** P16.8 — la place que le bandeau « Vous partagez » prend sous l'en-tête : ma vignette s'y range dessous, sans être recouverte. */
internal val LocalCallSelfTileBannerClearance = compositionLocalOf { 0.dp }

/**
 * Le dégagement de ma vignette sous la pile : il suit MON partage seulement (un partage reçu ne touche pas sa place,
 * #17730) et glisse avec le bandeau — transformation seule, un saut net sous « Réduire les animations ».
 */
@Composable
internal fun rememberSelfTileBannerClearance(reduceMotion: Boolean): Dp {
    val share: CallScreenShareViewModel = hiltViewModel()
    val state by share.state.collectAsState()
    val target = CallTopBannerStack.selfTileClearanceDp(isLocalScreenShareShown = state.phase == CallScreenSharePhase.Sharing).dp
    val spec = if (reduceMotion) snap<Dp>() else tween<Dp>(CallChromeStow.fadeMillis(reduceMotion = false))
    val animated by animateDpAsState(target, spec, label = "callSelfTileBannerClearance")
    return animated
}
