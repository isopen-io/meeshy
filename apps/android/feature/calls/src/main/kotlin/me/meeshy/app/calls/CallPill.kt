package me.meeshy.app.calls

import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.ContentTransform
import androidx.compose.animation.EnterTransition
import androidx.compose.animation.ExitTransition
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.scaleIn
import androidx.compose.animation.scaleOut
import androidx.compose.animation.togetherWith
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Call
import androidx.compose.material.icons.filled.Videocam
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import me.meeshy.feature.calls.R
import me.meeshy.sdk.model.call.CallHeaderNames
import me.meeshy.sdk.model.call.CallReducedCaption
import me.meeshy.sdk.model.call.CallShareCapsuleMotion
import me.meeshy.ui.accessibility.LocalReduceMotion
import me.meeshy.ui.component.MeeshyAvatar
import me.meeshy.ui.icons.MeeshyIcons
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshyRadius
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme
import me.meeshy.ui.theme.hexColor

/**
 * Pure decision: *when* the minimised floating call pill is shown. Isolated from
 * the Composable so both branches are unit-tested (parity with the iOS
 * `FloatingCallPillView` display guard `displayMode == .pip && callState.isActive`).
 *
 * The pill surfaces a *live, non-incoming* call the user has navigated away from —
 * an **incoming ringing** call is never minimised (it must be answered or declined
 * on the full screen first), and the pill hides while the full-screen call surface
 * is itself on top. A settled call ([CallStatus.IDLE]/[CallStatus.ENDED]) shows no
 * pill.
 */
object CallPillPresenter {
    private val PILL_STATUSES = setOf(
        CallStatus.OUTGOING_RINGING,
        CallStatus.CONNECTING,
        CallStatus.CONNECTED,
        CallStatus.RECONNECTING,
    )

    /** A live, non-incoming call the user may minimise (drives the CallScreen chevron). */
    fun isMinimizable(status: CallStatus): Boolean = status in PILL_STATUSES

    /** The pill shows for a minimisable call only while off the full-screen call surface. */
    fun shouldShow(status: CallStatus, onCallScreen: Boolean): Boolean =
        isMinimizable(status) && !onCallScreen

    /**
     * What the system Back gesture does on the call screen. A ringing incoming call
     * has no pill and no notification when it rang over the socket: popping the
     * screen would leave it ringing with no way to answer, so Back is inert (iOS
     * presents it as a full-screen cover with no dismiss gesture). A live call
     * minimises into the pill, exactly like the chevron; a settled call closes.
     */
    fun backAction(status: CallStatus): CallBackAction = when {
        status == CallStatus.INCOMING -> CallBackAction.Inert
        isMinimizable(status) -> CallBackAction.Minimize
        else -> CallBackAction.Close
    }
}

/** The outcome of the system Back gesture on the call screen ([CallPillPresenter.backAction]). */
enum class CallBackAction { Inert, Minimize, Close }

/**
 * The minimised call pill — a full-width banner pinned to the top of the app
 * (parity with iOS `FloatingCallPillView`, WhatsApp-style). It shows the peer, a
 * colour-coded status line (green duration once connected, amber while ringing /
 * connecting, red while reconnecting) and a phone / video glyph. Tapping it
 * re-opens the full-screen call ([onClick]); the underlying, Activity-scoped
 * [CallViewModel] keeps the call alive across the navigation.
 *
 * Pure glue: every value is derived from the immutable [state]; the accent is
 * resolved from the peer's account id ([peerUserId], the name only as a fallback — law 4 of
 * `docs/product/appels-vue-finale.md`). [peerAvatarUrl] is the peer's photo ([CallPeerVisual.avatarUrl]): like iOS,
 * the pill shows the real avatar, its initials only standing in while it loads (#12569).
 *
 * While I share my screen ([isScreenSharing]) the pill turns red and offers one control, « Arrêter »
 * ([onStopScreenShare]) — the capsule of law 12 (#16664), like iOS `FloatingCallPillView` and the web `CallPill`. It
 * then says « name · duration » (P18.10), the name being the header's ([names], iOS `CallReducedRule.title`), on the red glass of
 * the kit (S1.9). The swap in and out of that capsule is a short fade + scale ([reduceMotion] keeps the fade only — #17767).
 */
@Composable
fun CallPill(
    state: CallUiState,
    onClick: () -> Unit,
    onToggleMute: () -> Unit,
    onToggleSpeaker: () -> Unit,
    onHangUp: () -> Unit,
    modifier: Modifier = Modifier,
    peerAvatarUrl: String? = null,
    isScreenSharing: Boolean = false,
    onStopScreenShare: () -> Unit = {},
    peerUserId: String = "",
    names: CallHeaderNames = CallHeaderNames(givenName = null, groupName = null),
    reduceMotion: Boolean = LocalReduceMotion.current,
) {
    val reopenLabel = stringResource(R.string.call_pill_reopen)
    val ongoingLabel = stringResource(R.string.call_pill_ongoing, state.peerName)
    // #17767 — « Arrêter » prend et rend la place de la barre par un fondu et une échelle courts (loi 17).
    AnimatedContent(
        targetState = isScreenSharing,
        modifier = modifier,
        transitionSpec = { callPillSwap(reduceMotion) },
        label = "callPillShareSwap",
    ) { sharing ->
        if (sharing) {
            CallPillSharing(state, names, reopenLabel, ongoingLabel, onClick, onStopScreenShare)
        } else {
            CallPillIdle(state, peerAvatarUrl, peerUserId, reopenLabel, ongoingLabel, onClick, onToggleMute, onToggleSpeaker, onHangUp)
        }
    }
}

private fun callPillSwap(reduceMotion: Boolean): ContentTransform {
    val appearing = CallShareCapsuleMotion.windowFadeMillis(reduceMotion, appearing = true)
    val leaving = CallShareCapsuleMotion.windowFadeMillis(reduceMotion, appearing = false)
    val scale = CallShareCapsuleMotion.startScale(reduceMotion)
    val enter = fadeIn(tween(appearing)) + if (reduceMotion) EnterTransition.None else scaleIn(tween(appearing), initialScale = scale)
    val exit = fadeOut(tween(leaving)) + if (reduceMotion) ExitTransition.None else scaleOut(tween(leaving), targetScale = scale)
    return enter togetherWith exit
}

/** P18.10 / S1.9 — pendant MON partage : le verre rouge du kit, « nom · durée » et l'unique « Arrêter ». */
@Composable
private fun CallPillSharing(
    state: CallUiState,
    names: CallHeaderNames,
    reopenLabel: String,
    ongoingLabel: String,
    onClick: () -> Unit,
    onStopScreenShare: () -> Unit,
) {
    CallGlassPlate(
        modifier = Modifier.fillMaxWidth().padding(horizontal = MeeshySpacing.md),
        shape = RoundedCornerShape(MeeshyRadius.xxl),
        tint = MeeshyPalette.Error.copy(alpha = BANNER_TINT_ALPHA),
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = MeeshySpacing.md, vertical = MeeshySpacing.sm),
            horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.sm, Alignment.Start),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            CallPillReopenArea(reopenLabel, ongoingLabel, onClick) {
                val title = CallReducedCaption.title(names.givenName, names.groupName, displayName = state.peerName)
                CallPillSharingIdentity(CallReducedCaption.caption(title, pillStatusLine(state)))
            }
            CallShareStopButton(onStopScreenShare)
        }
    }
}

@Composable
private fun CallPillIdle(
    state: CallUiState,
    peerAvatarUrl: String?,
    peerUserId: String,
    reopenLabel: String,
    ongoingLabel: String,
    onClick: () -> Unit,
    onToggleMute: () -> Unit,
    onToggleSpeaker: () -> Unit,
    onHangUp: () -> Unit,
) {
    val accent = hexColor(CallTileRim.peerAvatar(peerUserId, state.peerName))
    val rim = CallTileRim.reducedRim(peerUserId, state.peerName, MeeshyTheme.tokens.warning)
    val shape = RoundedCornerShape(MeeshyRadius.xxl)
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = MeeshySpacing.md)
            .clip(shape)
            .background(MeeshyTheme.tokens.backgroundSecondary)
            .border(rim, shape)
            .padding(horizontal = MeeshySpacing.md, vertical = MeeshySpacing.sm),
        horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.sm, Alignment.Start),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        CallPillReopenArea(reopenLabel, ongoingLabel, onClick) {
            CallPillIdentity(state = state, peerAvatarUrl = peerAvatarUrl, accent = accent)
        }
        CallPillControls(
            state = state,
            onToggleMute = onToggleMute,
            onToggleSpeaker = onToggleSpeaker,
            onHangUp = onHangUp,
        )
    }
}

/** Only the identity part reopens the call: the controls beside it stay their own TalkBack elements. */
@Composable
private fun RowScope.CallPillReopenArea(
    reopenLabel: String,
    ongoingLabel: String,
    onClick: () -> Unit,
    content: @Composable RowScope.() -> Unit,
) {
    Row(
        modifier = Modifier
            .weight(1f)
            .clickable(onClickLabel = reopenLabel, onClick = onClick)
            .semantics { contentDescription = ongoingLabel },
        horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.md, Alignment.Start),
        verticalAlignment = Alignment.CenterVertically,
        content = content,
    )
}

/** Hors partage : l'avatar à la couleur de l'autre, son nom, la ligne d'état et le glyphe d'appel ou de vidéo. */
@Composable
private fun RowScope.CallPillIdentity(state: CallUiState, peerAvatarUrl: String?, accent: Color) {
    // Decorative: the identity row's label already names the peer.
    MeeshyAvatar(
        name = state.peerName,
        size = 40.dp,
        containerColor = accent,
        imageUrl = peerAvatarUrl,
        modifier = Modifier.clearAndSetSemantics { },
    )

    Column(modifier = Modifier.weight(1f)) {
        Text(
            text = state.peerName,
            style = MaterialTheme.typography.titleSmall,
            fontWeight = FontWeight.SemiBold,
            color = MeeshyTheme.tokens.textPrimary,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
        )
        Text(
            text = pillStatusLine(state),
            style = MaterialTheme.typography.bodySmall,
            color = pillStatusColor(state.status),
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
        )
    }

    Icon(
        imageVector = if (state.isVideoCall) Icons.Filled.Videocam else Icons.Filled.Call,
        contentDescription = null,
        tint = accent,
    )
}

/** P18.10 — pendant MON partage : l'icône d'écran puis « nom · durée » ; la bannière garde sa forme, « Arrêter » est à côté. */
@Composable
private fun RowScope.CallPillSharingIdentity(caption: String) {
    Icon(
        imageVector = MeeshyIcons.FlipToFront,
        contentDescription = null,
        tint = Color.White,
        modifier = Modifier.clearAndSetSemantics { },
    )
    Text(
        text = caption,
        style = MaterialTheme.typography.titleSmall,
        fontWeight = FontWeight.SemiBold,
        color = Color.White,
        maxLines = 1,
        overflow = TextOverflow.Ellipsis,
        modifier = Modifier.weight(1f),
    )
}

/**
 * Second line of the pill: the live duration once connected, otherwise the coarse
 * phase (ringing / connecting / reconnecting). Mirrors [CallScreen]'s `statusLabel`
 * for the minimisable phases; a non-minimisable status never reaches the pill.
 */
@Composable
private fun pillStatusLine(state: CallUiState): String = when (state.status) {
    CallStatus.CONNECTED -> state.durationLabel ?: stringResource(R.string.call_status_connected)
    CallStatus.OUTGOING_RINGING -> stringResource(R.string.call_status_ringing)
    CallStatus.CONNECTING -> stringResource(R.string.call_status_connecting)
    CallStatus.RECONNECTING -> stringResource(R.string.call_status_reconnecting, state.reconnectAttempt)
    else -> stringResource(R.string.call_status_connected)
}

@Composable
private fun pillStatusColor(status: CallStatus): Color = when (status) {
    CallStatus.CONNECTED -> MeeshyTheme.tokens.success
    CallStatus.RECONNECTING -> MeeshyTheme.tokens.error
    CallStatus.OUTGOING_RINGING, CallStatus.CONNECTING -> MeeshyTheme.tokens.warning
    else -> MeeshyTheme.tokens.textSecondary
}
