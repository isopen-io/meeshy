package me.meeshy.app.calls

import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import dagger.Binds
import dagger.Module
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import dagger.multibindings.IntoSet
import me.meeshy.feature.calls.R
import me.meeshy.sdk.model.call.CallAction
import me.meeshy.sdk.model.call.CallChromeElement
import me.meeshy.sdk.model.call.CallServicePillLaw
import me.meeshy.sdk.model.call.CallServicePillSignals
import me.meeshy.sdk.model.call.CallServicePills
import me.meeshy.sdk.model.call.CallTopBanner
import me.meeshy.sdk.model.call.CallTopBannerStack
import me.meeshy.sdk.model.call.CallVerticalEdge
import me.meeshy.ui.theme.MeeshySpacing
import javax.inject.Inject
import javax.inject.Singleton

/** L'opacité du micro et de la caméra pendant l'attente : ils restent visibles, mais ne répondent plus à rien. */
internal const val HOLD_DIMMED_ALPHA = 0.4f

/** Les actions de la pilule atténuées pendant l'attente (la caméra ; le micro de la rangée de base l'est par [CallUiState.isOnHold]). */
internal val HOLD_DIMMED_ACTIONS: Set<CallAction> = setOf(CallAction.Camera)

/**
 * #18227 — les pastilles de service de cet instant de l'appel, par la loi pure [CallServicePillLaw] : le SEUL site qui la lit
 * pour l'écran (les deux maillons de la pile et la place que ma vignette et la grille leur cèdent).
 */
internal fun CallOverlayContext.servicePills(): CallServicePills = CallServicePillLaw.of(
    CallServicePillSignals(
        isConnectedLayout = state.showsConnectedLayout,
        isPictureInPicture = inPip,
        isOnHold = state.isOnHold,
        isVideoCall = state.isVideoCall,
        isCameraOn = state.isCameraOn,
        videoNotice = state.videoNotice,
    ),
)

/**
 * E3 (#18227) — « En attente » est un maillon de la pile des bannières du haut, sous l'en-tête, après la capture : elle arrive du
 * haut et y repart ([CallBannerPresence]), dit sa hauteur pour que ma vignette descende dessous, et s'annonce aux lecteurs d'écran.
 * Comme toute bannière, elle se range au premier toucher et revient au second (`CallChromeElement.ServicePill`, loi 11, #18398) ;
 * « Réduire les animations » : un fondu ; sous TalkBack, rien ne se range.
 */
@Singleton
class CallHoldOverlay @Inject constructor() : CallOverlay {
    override val id: String = "call-hold"
    override val slot: CallOverlaySlot = CallOverlaySlot.TopBanner
    override val priority: Int = CallTopBannerStack.priority(CallTopBanner.Hold)

    @Composable
    override fun Content(context: CallOverlayContext) {
        CallBannerPresence(context.servicePills().isHoldShown.takeIf { it }) {
            CallServicePillFade(context) {
                CallHoldBadge(
                    Modifier
                        .padding(horizontal = CallTopBannerStack.HORIZONTAL_MARGIN_DP.dp)
                        .padding(top = CallTopBannerStack.GAP_DP.dp)
                        .reportsTopBannerHeight(CallTopBanner.Hold),
                )
            }
        }
    }
}

/**
 * #18398 — le chemin de rangement des pastilles de service, celui de la puce de capture (#18376) : elles sortent par le haut
 * AVEC les bannières au premier toucher et reviennent au second ([CallChromeFade]).
 */
@Composable
internal fun CallServicePillFade(context: CallOverlayContext, content: @Composable () -> Unit) {
    CallChromeFade(
        isVisible = context.chrome.isVisible(CallChromeElement.ServicePill),
        onRevive = context.onChromeRevive,
        stowsToward = CallVerticalEdge.Top,
        edgeMargin = CallTopBannerStack.HEADER_ROW_CLEARANCE_DP.dp,
        content = content,
    )
}

/** La pastille « En attente » : une capsule du verre de l'écran d'appel, sous son voile de ton (loi 18.1). */
@Composable
internal fun CallHoldBadge(modifier: Modifier = Modifier) {
    CallGlassPlate(
        modifier = modifier.semantics(mergeDescendants = true) { liveRegion = LiveRegionMode.Polite },
        shape = CircleShape,
    ) {
        CallToneScrim()
        Text(
            text = stringResource(R.string.call_service_on_hold),
            style = MaterialTheme.typography.titleMedium,
            fontWeight = FontWeight.SemiBold,
            color = CallPalette.Ink,
            modifier = Modifier.padding(horizontal = MeeshySpacing.lg, vertical = MeeshySpacing.sm),
        )
    }
}

@Module
@InstallIn(SingletonComponent::class)
interface CallHoldOverlayModule {
    @Binds
    @IntoSet
    fun bindCallHoldOverlay(impl: CallHoldOverlay): CallOverlay
}
