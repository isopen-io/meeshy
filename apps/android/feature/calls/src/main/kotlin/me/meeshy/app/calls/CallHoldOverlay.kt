package me.meeshy.app.calls

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import dagger.Binds
import dagger.Module
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import dagger.multibindings.IntoSet
import me.meeshy.feature.calls.R
import me.meeshy.sdk.model.call.CallAction
import me.meeshy.ui.theme.MeeshySpacing
import javax.inject.Inject
import javax.inject.Singleton

private const val HOLD_SCRIM_ALPHA = 0.55f

/** L'opacité du micro et de la caméra pendant l'attente : ils restent visibles, mais ne répondent plus à rien. */
internal const val HOLD_DIMMED_ALPHA = 0.4f

/** Les actions de la pilule atténuées pendant l'attente (la caméra ; le micro de la rangée de base l'est par [CallUiState.isOnHold]). */
internal val HOLD_DIMMED_ACTIONS: Set<CallAction> = setOf(CallAction.Camera)

/** La surcouche « En attente » au centre de l'écran d'appel, annoncée aux lecteurs d'écran. */
@Singleton
class CallHoldOverlay @Inject constructor() : CallOverlay {
    override val id: String = "call-hold"
    override val slot: CallOverlaySlot = CallOverlaySlot.Center
    override val priority: Int = 10

    override fun isVisible(state: CallUiState): Boolean = state.isOnHold

    @Composable
    override fun Content(context: CallOverlayContext) {
        CallHoldBadge()
    }
}

@Composable
internal fun CallHoldBadge(modifier: Modifier = Modifier) {
    Box(
        modifier = modifier
            .clip(CircleShape)
            .background(CallPalette.Veil.copy(alpha = HOLD_SCRIM_ALPHA))
            .padding(horizontal = MeeshySpacing.lg, vertical = MeeshySpacing.sm)
            .semantics { liveRegion = LiveRegionMode.Polite },
    ) {
        Text(
            text = stringResource(R.string.call_service_on_hold),
            style = MaterialTheme.typography.titleMedium,
            color = CallPalette.Ink,
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
