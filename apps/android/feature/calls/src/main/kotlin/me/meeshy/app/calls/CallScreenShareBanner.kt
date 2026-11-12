package me.meeshy.app.calls

import android.content.ActivityNotFoundException
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.EnterTransition
import androidx.compose.animation.ExitTransition
import androidx.compose.animation.core.tween
import androidx.compose.animation.expandVertically
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.shrinkVertically
import androidx.compose.animation.slideInVertically
import androidx.compose.animation.slideOutVertically
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.defaultMinSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import me.meeshy.feature.calls.R
import me.meeshy.sdk.model.call.CallChromeElement
import me.meeshy.sdk.model.call.CallChromeStow
import me.meeshy.sdk.model.call.CallTopBanner
import me.meeshy.sdk.model.call.CallTopBannerStack
import me.meeshy.sdk.model.call.CallVerticalEdge
import me.meeshy.sdk.model.call.screenshare.CallScreenShareLaw
import me.meeshy.sdk.model.call.screenshare.CallScreenSharePhase
import me.meeshy.ui.component.chrome.MeeshyGlassSurface
import me.meeshy.ui.icons.MeeshyIcons
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshySpacing
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Le partage d'écran sur l'écran d'appel (#13332), comme iOS `CallScreenShareBanner` : « Vous partagez
 * votre écran · Arrêter » chez le partageur, « Alice partage son écran » chez l'autre. Il porte aussi le
 * dialogue système de consentement, lancé une fois par demande — même après une rotation. Le bandeau est le
 * PREMIER de la pile sous l'en-tête ([CallTopBannerStack], P16.7), presque pleine largeur ; il arrive du haut et y
 * repart quand le partage cesse, en mouvement et en fondu (« Réduire les animations » : un fondu court, P16.6) ;
 * il s'efface avec les commandes de l'appel (`CallChromeElement.ScreenShareBanner`, #13736) en gagnant son bord
 * (P16.11). Le dialogue, lui, reste composé.
 */
@Singleton
class CallScreenShareBannerOverlay @Inject constructor(
    private val controller: CallScreenShareController,
) : CallOverlay {
    override val id: String = "call-screen-share"
    override val slot: CallOverlaySlot = CallOverlaySlot.TopBanner
    override val priority: Int = CallTopBannerStack.priority(CallTopBanner.ScreenShare)

    @Composable
    override fun Content(context: CallOverlayContext) {
        val share by controller.state.collectAsState()
        ScreenShareConsentRequest(share, controller::onConsent)
        val current = bannerText(share, context.state)?.let { ScreenShareFace(it, stoppable = share.phase == CallScreenSharePhase.Sharing) }
        // Le dernier visage reste le temps de la sortie : le texte ne saute pas pendant que le bandeau repart.
        val last = remember { arrayOfNulls<ScreenShareFace>(1) }
        if (current != null) last[0] = current
        val reduceMotion = rememberCallReduceMotion()
        val millis = CallChromeStow.fadeMillis(reduceMotion)
        val towardTop = CallTopBannerStack.leavesTowardTop(reduceMotion)
        AnimatedVisibility(
            visible = current != null,
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
            val face = current ?: last[0]
            if (face != null) {
                CallChromeFade(
                    isVisible = context.chrome.isVisible(CallChromeElement.ScreenShareBanner),
                    onRevive = context.onChromeRevive,
                    modifier = Modifier.fillMaxWidth(),
                    stowsToward = CallVerticalEdge.Top,
                    edgeMargin = CallTopBannerStack.HEADER_ROW_CLEARANCE_DP.dp,
                ) {
                    ScreenShareBanner(
                        text = face.text,
                        onStop = if (face.stoppable) controller::toggle else null,
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(horizontal = CallTopBannerStack.HORIZONTAL_MARGIN_DP.dp)
                            .padding(top = CallTopBannerStack.GAP_DP.dp),
                    )
                }
            }
        }
    }
}

/** Ce que le bandeau dit et s'il offre « Arrêter » (mon partage seulement). */
private data class ScreenShareFace(val text: String, val stoppable: Boolean)

/**
 * Mon partage commence : l'appel se replie dans la pastille rouge « Arrêter » (#16664, loi 12 de
 * `docs/product/appels-vue-finale.md`), comme iOS `screenShareDidStart` et le web `startScreen`.
 */
@Composable
internal fun ScreenShareFoldsCall(onMinimize: () -> Unit) {
    val share: CallScreenShareViewModel = hiltViewModel()
    val minimize by rememberUpdatedState(onMinimize)
    LaunchedEffect(share) {
        var previous = share.state.value.phase
        share.state.collect { next ->
            val before = previous
            previous = next.phase
            if (CallScreenShareLaw.minimizesOnStart(before, next.phase)) minimize()
        }
    }
}

/** Le texte de la bannière : mon partage d'abord, puis celui du pair ; `null` quand personne ne partage. */
@Composable
private fun bannerText(share: CallScreenShareUi, state: CallUiState): String? = when {
    share.phase == CallScreenSharePhase.Sharing -> stringResource(R.string.call_screen_share_local_banner)
    state.isPeerScreenSharing -> state.peerName.takeIf { it.isNotBlank() }
        ?.let { stringResource(R.string.call_screen_share_remote_banner, it) }
        ?: stringResource(R.string.call_screen_share_remote_banner_generic)
    else -> null
}

@Composable
private fun ScreenShareConsentRequest(share: CallScreenShareUi, onConsent: (MediaProjectionConsent) -> Unit) {
    val launcher = rememberLauncherForActivityResult(RequestMediaProjectionConsent(), onConsent)
    var launched by rememberSaveable { mutableIntStateOf(0) }
    LaunchedEffect(share.asksConsent, share.consentRequest) {
        if (!share.asksConsent || share.consentRequest == launched) return@LaunchedEffect
        launched = share.consentRequest
        try {
            launcher.launch(Unit)
        } catch (_: ActivityNotFoundException) {
            onConsent(MediaProjectionConsent.Denied)
        }
    }
}

@Composable
private fun ScreenShareBanner(text: String, onStop: (() -> Unit)?, modifier: Modifier = Modifier) {
    MeeshyGlassSurface(
        modifier = modifier.semantics { liveRegion = LiveRegionMode.Polite },
        shape = CircleShape,
        tint = MeeshyPalette.Error.copy(alpha = BANNER_TINT_ALPHA),
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .defaultMinSize(minHeight = BANNER_MIN_HEIGHT)
                .padding(start = MeeshySpacing.mdPlus, end = if (onStop == null) MeeshySpacing.mdPlus else MeeshySpacing.xs),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.smPlus),
        ) {
            Icon(MeeshyIcons.FlipToFront, contentDescription = null, tint = MeeshyPalette.Error, modifier = Modifier.size(16.dp))
            Text(
                text = text,
                style = MaterialTheme.typography.labelMedium,
                fontWeight = FontWeight.Medium,
                color = Color.White,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
                modifier = Modifier.weight(1f),
            )
            if (onStop != null) ScreenShareStopButton(onStop)
        }
    }
}

@Composable
private fun ScreenShareStopButton(onStop: () -> Unit) {
    val label = stringResource(R.string.call_screen_share_stop)
    Box(
        modifier = Modifier
            .defaultMinSize(minWidth = BANNER_MIN_HEIGHT, minHeight = BANNER_MIN_HEIGHT)
            .clip(CircleShape)
            .clickable(onClickLabel = label, role = Role.Button, onClick = onStop)
            .padding(horizontal = MeeshySpacing.md),
        contentAlignment = Alignment.Center,
    ) {
        Text(
            text = stringResource(R.string.call_screen_share_stop_caption),
            style = MaterialTheme.typography.labelMedium,
            fontWeight = FontWeight.SemiBold,
            color = Color.White,
            modifier = Modifier.semantics { this.contentDescription = label },
        )
    }
}

private const val BANNER_TINT_ALPHA = 0.35f
private val BANNER_MIN_HEIGHT = CallTopBannerStack.BANNER_HEIGHT_DP.dp
