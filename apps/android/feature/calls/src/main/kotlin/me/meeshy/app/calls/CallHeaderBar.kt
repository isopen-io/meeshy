package me.meeshy.app.calls

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.stateDescription
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.delay
import me.meeshy.feature.calls.R
import me.meeshy.sdk.model.call.CallHeaderLaw
import me.meeshy.sdk.model.call.CallSignalStrength
import me.meeshy.ui.icons.MeeshyIcons
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme

private val GLYPH_DIAMETER = 40.dp
private val CHIP_HEIGHT = 44.dp
private const val CHIP_SCRIM_ALPHA = 0.35f

/**
 * L'en-tête de l'écran d'appel (miroir de iOS `topChrome`) : le chevron « Réduire » et la porte vers
 * la conversation à gauche ; à droite, en appel vidéo établi, la puce durée · signal. Le nom, la
 * qualité et le compteur ne restent plus au centre de l'image.
 */
@Composable
internal fun CallHeaderBar(
    state: CallUiState,
    conversationId: String?,
    showsMinimize: Boolean,
    onMinimize: () -> Unit,
    modifier: Modifier = Modifier,
    isVideoStage: Boolean = state.isVideoCall,
) {
    Row(
        modifier = modifier.fillMaxWidth(),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.sm),
    ) {
        if (showsMinimize) {
            CallPillButton(
                icon = MeeshyIcons.ChevronDown,
                kind = CallPillKind.Normal,
                label = stringResource(R.string.call_action_minimize),
                onClick = onMinimize,
                diameter = GLYPH_DIAMETER,
            )
            if (CallHeaderLaw.showsConversationButton(conversationId)) {
                CallPillButton(
                    icon = MeeshyIcons.ForumFilled,
                    kind = CallPillKind.Normal,
                    label = stringResource(R.string.call_open_conversation),
                    hint = stringResource(R.string.call_open_conversation_hint),
                    onClick = onMinimize,
                    diameter = GLYPH_DIAMETER,
                )
            }
        }
        Box(Modifier.weight(1f))
        if (CallHeaderLaw.showsDurationChip(state.showsConnectedLayout, isVideoUiActive = isVideoStage)) {
            CallDurationChip(state)
        }
    }
}

/** La puce : glyphe de signal (transitoire), chrono vivant, réseau du pair dégradé, reconnexion. */
@Composable
private fun CallDurationChip(state: CallUiState) {
    val description = stringResource(R.string.call_duration_a11y)
    val seconds = liveOrFixedSeconds(state.hasLiveClock, LocalCallLiveSeconds.current, state.durationSeconds)
    val resources = LocalContext.current.resources
    val spoken = remember(seconds, resources) { CallSpokenDuration.spoken(resources, seconds) }
    val clock = if (state.hasLiveClock) clockLabel(seconds) else state.durationLabel.orEmpty()
    val warning = MeeshyTheme.tokens.warning
    Row(
        modifier = Modifier
            .height(CHIP_HEIGHT)
            .clip(CircleShape)
            .background(Color.Black.copy(alpha = CHIP_SCRIM_ALPHA), CircleShape)
            .padding(horizontal = MeeshySpacing.smPlus, vertical = MeeshySpacing.xs)
            .semantics(mergeDescendants = true) {
                contentDescription = description
                stateDescription = spoken
            },
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.xsPlus),
    ) {
        TransientCallSignalGlyph(CallHeaderLaw.signalStrength(state.connectionQuality))
        Text(
            text = clock,
            style = MaterialTheme.typography.labelSmall,
            fontWeight = FontWeight.Medium,
            color = CallPalette.Ink,
        )
        if (state.isPeerQualityDegraded) {
            Icon(MeeshyIcons.WifiProblem, contentDescription = null, tint = warning, modifier = Modifier.size(14.dp))
        }
        if (state.status == CallStatus.RECONNECTING) {
            Icon(MeeshyIcons.Sync, contentDescription = null, tint = warning, modifier = Modifier.size(14.dp))
        }
    }
}

/** Invisible sur un lien sain ; apparaît à la dégradation, suit la qualité, reste vert 30 s après la guérison. */
@Composable
private fun TransientCallSignalGlyph(strength: CallSignalStrength) {
    var shown by remember { mutableStateOf(false) }
    LaunchedEffect(strength.isDegraded) {
        if (strength.isDegraded) {
            shown = true
        } else if (shown) {
            delay(CallHeaderLaw.SIGNAL_RECOVERY_LINGER_MILLIS)
            shown = false
        }
    }
    if (shown) CallSignalGlyph(strength)
}

@Composable
private fun CallSignalGlyph(strength: CallSignalStrength) {
    val tint = when (strength) {
        CallSignalStrength.EXCELLENT, CallSignalStrength.GOOD -> MeeshyPalette.Success
        CallSignalStrength.FAIR -> MeeshyTheme.tokens.warning
        CallSignalStrength.POOR, CallSignalStrength.LOST -> MeeshyPalette.Error
        CallSignalStrength.CONNECTING -> MeeshyPalette.Indigo400
    }
    val filled = Math.round(strength.barsFraction * BAR_COUNT).toInt()
    val label = stringResource(
        when (strength) {
            CallSignalStrength.EXCELLENT, CallSignalStrength.GOOD -> R.string.call_quality_good
            CallSignalStrength.FAIR -> R.string.call_quality_fair
            CallSignalStrength.POOR, CallSignalStrength.LOST -> R.string.call_quality_poor
            CallSignalStrength.CONNECTING -> R.string.call_status_connecting
        },
    )
    Row(
        horizontalArrangement = Arrangement.spacedBy(2.dp),
        verticalAlignment = Alignment.Bottom,
        modifier = Modifier.semantics { contentDescription = label },
    ) {
        repeat(BAR_COUNT) { index ->
            Box(
                Modifier
                    .width(3.dp)
                    .height((4 + 3 * index).dp)
                    .clip(RoundedCornerShape(1.dp))
                    .background(if (index < filled) tint else tint.copy(alpha = EMPTY_BAR_ALPHA)),
            )
        }
    }
}

private const val BAR_COUNT = 4
private const val EMPTY_BAR_ALPHA = 0.3f
