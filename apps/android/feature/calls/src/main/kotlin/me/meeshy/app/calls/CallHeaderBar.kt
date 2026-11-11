package me.meeshy.app.calls

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.scaleIn
import androidx.compose.animation.scaleOut
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
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ProvideTextStyle
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.TransformOrigin
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.onClick
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import me.meeshy.feature.calls.R
import me.meeshy.sdk.model.call.CallHeaderAction
import me.meeshy.sdk.model.call.CallHeaderCapsule
import me.meeshy.sdk.model.call.CallHeaderCapsuleInput
import me.meeshy.sdk.model.call.CallHeaderCapsuleLayout
import me.meeshy.sdk.model.call.CallHeaderContext
import me.meeshy.sdk.model.call.CallHeaderLaw
import me.meeshy.sdk.model.call.CallHeaderNames
import me.meeshy.sdk.model.call.CallSignalStrength
import me.meeshy.sdk.model.call.CallVideoBadgeAccessibility
import me.meeshy.ui.accessibility.MetaSeparator
import me.meeshy.ui.icons.MeeshyIcons
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme

private val GLYPH_DIAMETER = 40.dp
private val CHIP_HEIGHT = 48.dp
private val TITLE_MAX_WIDTH = 140.dp
private val CHIP_ICON = 14.dp
private const val APPEAR_SCALE = 0.8f

/**
 * L'en-tête de l'écran d'appel (miroir de iOS `topChrome`, #17329) : à gauche, Réduire · Image dans l'image
 * (si l'appel y est éligible, ou pour en sortir) · Conversation (si elle est connue, et elle OUVRE la
 * conversation) ; à droite, la capsule (#17341, [CallHeaderLaw.capsule]) : en vidéo le nom donné · la durée,
 * en groupe le nom · le nombre · la durée, en audio le réseau dégradé seul. Le réseau n'y paraît jamais que dégradé.
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
    isGroupStage: Boolean = false,
    names: CallHeaderNames = CallHeaderNames(givenName = null, groupName = null),
    participantCount: Int = 0,
    canEnterPictureInPicture: Boolean = false,
    isPictureInPictureActive: Boolean = false,
    onEnterPictureInPicture: () -> Unit = {},
    onOpenConversation: () -> Unit = onMinimize,
) {
    val actions = headerActions(showsMinimize, conversationId, canEnterPictureInPicture, isPictureInPictureActive)
    val strength = CallHeaderLaw.signalStrength(state.connectionQuality)
    val layout = when {
        isGroupStage -> CallHeaderCapsuleLayout.Group
        isVideoStage -> CallHeaderCapsuleLayout.Video
        else -> CallHeaderCapsuleLayout.Audio
    }
    val capsule = headerCapsule(state, strength, layout, names, participantCount)
    Row(
        modifier = modifier.fillMaxWidth(),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.sm),
    ) {
        CallHeaderAppear(CallHeaderAction.Minimize in actions) {
            CallPillButton(
                icon = MeeshyIcons.ChevronDown,
                kind = CallPillKind.Normal,
                label = stringResource(R.string.call_action_minimize),
                onClick = onMinimize,
                diameter = GLYPH_DIAMETER,
            )
        }
        CallHeaderAppear(CallHeaderAction.PictureInPicture in actions) {
            CallPillButton(
                icon = MeeshyIcons.PictureInPicture,
                kind = if (isPictureInPictureActive) CallPillKind.Active else CallPillKind.Normal,
                label = stringResource(R.string.call_control_pip),
                onClick = onEnterPictureInPicture,
                diameter = GLYPH_DIAMETER,
            )
        }
        CallHeaderAppear(CallHeaderAction.Conversation in actions) {
            CallPillButton(
                icon = MeeshyIcons.ForumFilled,
                kind = CallPillKind.Normal,
                label = stringResource(R.string.call_open_conversation),
                hint = stringResource(R.string.call_open_conversation_hint),
                onClick = onOpenConversation,
                diameter = GLYPH_DIAMETER,
            )
        }
        Box(Modifier.weight(1f), contentAlignment = Alignment.CenterEnd) {
            var lastCapsule by remember { mutableStateOf(capsule) }
            if (capsule != null) lastCapsule = capsule
            CallHeaderAppear(capsule != null, anchorEnd = true) {
                lastCapsule?.let { CallDurationChip(state, it, strength, onOpenQualityDetail) }
            }
        }
    }
}

private fun headerActions(
    showsMinimize: Boolean,
    conversationId: String?,
    canEnterPictureInPicture: Boolean,
    isPictureInPictureActive: Boolean,
): List<CallHeaderAction> {
    if (!showsMinimize) return emptyList()
    return CallHeaderLaw.actions(
        CallHeaderContext(
            canEnterPictureInPicture = canEnterPictureInPicture,
            isPictureInPictureActive = isPictureInPictureActive,
            hasConversation = CallHeaderLaw.showsConversationButton(conversationId),
        ),
    )
}

private fun headerCapsule(
    state: CallUiState,
    strength: CallSignalStrength,
    layout: CallHeaderCapsuleLayout,
    names: CallHeaderNames,
    participantCount: Int,
): CallHeaderCapsule? = CallHeaderLaw.capsule(
    CallHeaderCapsuleInput(
        layout = layout,
        isEstablished = state.showsConnectedLayout,
        isNetworkDegraded = strength.isDegraded || state.isPeerQualityDegraded || state.status == CallStatus.RECONNECTING,
        givenName = names.givenName,
        displayName = state.peerName,
        groupName = names.groupName,
        participantCount = participantCount,
    ),
)

/** Un élément de l'en-tête entre en fondu depuis son bord et en repart par lui ; « Réduire les animations » ne garde que le fondu. */
@Composable
private fun CallHeaderAppear(visible: Boolean, anchorEnd: Boolean = false, content: @Composable () -> Unit) {
    val reduceMotion = rememberCallReduceMotion()
    val origin = TransformOrigin(if (anchorEnd) 1f else 0f, 0.5f)
    AnimatedVisibility(
        visible = visible,
        enter = if (reduceMotion) fadeIn() else fadeIn() + scaleIn(initialScale = APPEAR_SCALE, transformOrigin = origin),
        exit = if (reduceMotion) fadeOut() else fadeOut() + scaleOut(targetScale = APPEAR_SCALE, transformOrigin = origin),
    ) { content() }
}

/**
 * La capsule de verre (miroir de iOS `durationChip`) : signal transitoire, titre, nombre, durée tabulaire qui se
 * recompose seule, wifi d'alerte du réseau du pair, flèche de reconnexion. #17323 — elle s'ouvre au toucher (la
 * feuille de qualité) : un verre interactif, comme les boutons voisins. TalkBack lit UNE phrase composée
 * ([CallVideoBadgeAccessibility]) : titre, nombre, durée, puis l'état du réseau. En audio, la sourdine et la
 * reconnexion ont déjà leur pastille sous l'avatar : la capsule ne les répète pas (iOS `chipWarnings`).
 */
@Composable
private fun CallDurationChip(
    state: CallUiState,
    capsule: CallHeaderCapsule,
    strength: CallSignalStrength,
    onOpenQualityDetail: () -> Unit,
) {
    val phrases = CallVideoBadgeAccessibility.Phrases(
        duration = stringResource(R.string.call_duration_a11y),
        peerMuted = stringResource(R.string.call_stage_peer_muted),
        peerNetworkWeak = stringResource(R.string.call_stage_peer_network),
        reconnecting = stringResource(R.string.call_reconnecting),
    )
    val reconnecting = capsule.showsDuration && state.status == CallStatus.RECONNECTING
    val participants = capsule.participantCount?.let { "${stringResource(R.string.call_detail_participants)} $it" }
    val description = CallVideoBadgeAccessibility.label(
        phrases = phrases,
        signalDegraded = strength.label.text().takeIf { strength.isDegraded },
        peerMuted = capsule.showsDuration && state.isPeerMuted,
        peerNetworkWeak = state.isPeerQualityDegraded,
        reconnecting = reconnecting,
        title = capsule.title,
        participants = participants,
        includesDuration = capsule.showsDuration,
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
            ProvideTextStyle(MaterialTheme.typography.labelMedium.copy(color = CallPalette.Ink)) {
                CallCapsuleIdentity(capsule)
            }
            if (capsule.showsDuration) {
                CallDurationClockText(
                    hasLiveClock = state.hasLiveClock,
                    fixedSeconds = state.durationSeconds,
                    fixedLabel = state.durationLabel,
                    color = CallPalette.Ink,
                )
            }
            if (capsule.showsNetwork && state.isPeerQualityDegraded) {
                Icon(MeeshyIcons.WifiProblem, contentDescription = null, tint = warning, modifier = Modifier.size(CHIP_ICON))
            }
            if (reconnecting) {
                Icon(MeeshyIcons.Sync, contentDescription = null, tint = warning, modifier = Modifier.size(CHIP_ICON))
            }
        }
    }
}

/**
 * Le nom, puis le nombre (glyphe de groupe), chacun suivi du séparateur partagé (iOS `chipIdentity`) : la loi ne les
 * donne qu'avec la durée, qui les suit, donc aucun séparateur ne reste orphelin. Le séparateur n'est jamais lu.
 */
@Composable
private fun CallCapsuleIdentity(capsule: CallHeaderCapsule) {
    capsule.title?.let { title ->
        Text(text = title, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.widthIn(max = TITLE_MAX_WIDTH))
        MetaSeparator()
    }
    capsule.participantCount?.let { count ->
        Icon(MeeshyIcons.GroupFilled, contentDescription = null, tint = CallPalette.Ink, modifier = Modifier.size(CHIP_ICON))
        Text(text = count.toString())
        MetaSeparator()
    }
}
