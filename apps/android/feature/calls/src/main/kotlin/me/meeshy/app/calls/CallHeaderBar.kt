package me.meeshy.app.calls

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsPressedAsState
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Icon
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.onClick
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import me.meeshy.feature.calls.R
import me.meeshy.sdk.model.call.CallHeaderLaw
import me.meeshy.sdk.model.call.CallVideoBadgeAccessibility
import me.meeshy.ui.icons.MeeshyIcons
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme

private val GLYPH_DIAMETER = 40.dp
private val CHIP_HEIGHT = 48.dp

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
    onOpenQualityDetail: () -> Unit = {},
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
            CallDurationChip(state, onOpenQualityDetail)
        }
    }
}

/**
 * La puce de verre (miroir de iOS `durationChip`) : glyphe de signal transitoire, durée tabulaire qui se
 * recompose seule, wifi d'alerte du réseau du pair, flèche de reconnexion. #17323 — elle s'ouvre au toucher (la feuille
 * de qualité) : un verre interactif, comme les boutons voisins. TalkBack lit UNE phrase composée
 * ([CallVideoBadgeAccessibility]) suivie de la durée parlée.
 */
@Composable
private fun CallDurationChip(state: CallUiState, onOpenQualityDetail: () -> Unit) {
    val phrases = CallVideoBadgeAccessibility.Phrases(
        duration = stringResource(R.string.call_duration_a11y),
        peerMuted = stringResource(R.string.call_stage_peer_muted),
        peerNetworkWeak = stringResource(R.string.call_stage_peer_network),
        reconnecting = stringResource(R.string.call_reconnecting),
    )
    val strength = CallHeaderLaw.signalStrength(state.connectionQuality)
    val signalDegraded = strength.label.text().takeIf { strength.isDegraded }
    val reconnecting = state.status == CallStatus.RECONNECTING
    val description = CallVideoBadgeAccessibility.label(
        phrases = phrases,
        signalDegraded = signalDegraded,
        peerMuted = state.isPeerMuted,
        peerNetworkWeak = state.isPeerQualityDegraded,
        reconnecting = reconnecting,
    )
    val hint = stringResource(R.string.call_quality_open_hint)
    val warning = MeeshyTheme.tokens.warning
    val glassTone = LocalCallGlassTone.current
    val source = remember { MutableInteractionSource() }
    val pressed by source.collectIsPressedAsState()
    CallGlassPlate(
        modifier = Modifier
            .height(CHIP_HEIGHT)
            .clickable(interactionSource = source, indication = null, role = Role.Button, onClick = onOpenQualityDetail)
            .semantics(mergeDescendants = true) {
                contentDescription = description
                onClick(label = hint) { onOpenQualityDetail(); true }
            },
        shape = RoundedCornerShape(percent = 50),
        liquid = true,
    ) {
        Row(
            modifier = Modifier
                .fillMaxHeight()
                .background(glassTone.veil(glassTone.chipScrimAlpha))
                .background(CallButtonFill.pressedHighlight(pressed))
                .padding(horizontal = MeeshySpacing.smPlus, vertical = MeeshySpacing.xs),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.xsPlus),
        ) {
            TransientCallSignalGlyph(strength)
            CallDurationClockText(
                hasLiveClock = state.hasLiveClock,
                fixedSeconds = state.durationSeconds,
                fixedLabel = state.durationLabel,
                color = CallPalette.Ink,
            )
            if (state.isPeerQualityDegraded) {
                Icon(MeeshyIcons.WifiProblem, contentDescription = null, tint = warning, modifier = Modifier.size(14.dp))
            }
            if (reconnecting) {
                Icon(MeeshyIcons.Sync, contentDescription = null, tint = warning, modifier = Modifier.size(14.dp))
            }
        }
    }
}
