package me.meeshy.app.chat

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.scaleIn
import androidx.compose.animation.scaleOut
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.size
import androidx.compose.material3.Icon
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.Stable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.stateDescription
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import me.meeshy.sdk.model.relation.TalkieHeaderDelivery
import me.meeshy.sdk.model.relation.TalkieHeaderVoice
import me.meeshy.sdk.model.relation.TalkieHoldLook
import me.meeshy.sdk.model.relation.TalkieSendPhase
import me.meeshy.sdk.theme.DynamicColorGenerator
import me.meeshy.ui.R as UiR
import me.meeshy.ui.component.permission.PermissionFlow
import me.meeshy.ui.component.permission.PermissionFlowHost
import me.meeshy.ui.component.permission.rememberPermissionFlow
import me.meeshy.ui.component.talkie.TalkieHeaderLive
import me.meeshy.ui.component.talkie.TalkieHoldActions
import me.meeshy.ui.component.talkie.TalkieNoticeEffect
import me.meeshy.ui.component.talkie.TalkieWording
import me.meeshy.ui.component.talkie.talkieHold
import me.meeshy.ui.icons.MeeshyIcons

internal const val CHAT_HEADER_TALKIE_TAG = "conversation.header.talkie"

/** Le talkie d'un direct, pour l'en-tête : ce qu'il publie à la bande, et son bouton à poser à gauche de l'appel. */
@Stable
internal class ChatHeaderTalkie(val live: TalkieHeaderLive, val button: @Composable () -> Unit)

/**
 * Le talkie dans l'en-tête d'un direct (#17315, iso `ConversationHeaderTalkieButton`) : proposé dès Proche, jamais dans un
 * direct chiffré ni dans un aperçu (l'hôte en décide). Le doigt posé enfonce et vibre ; la voix qui part, ou celle du pair
 * qui arrive, donne toute la barre d'en-tête au talkie ; un `TALKIE_NOT_ALLOWED` le retire, comme sur la fiche. Le (i) du
 * talkie ne vit que sur la fiche profil (#17339).
 */
@Composable
internal fun rememberChatHeaderTalkie(
    peerUserId: String,
    peerName: String,
    accent: Color,
    viewModel: ChatHeaderTalkieViewModel = hiltViewModel(key = "header-talkie-$peerUserId"),
): ChatHeaderTalkie {
    LaunchedEffect(peerUserId) { viewModel.load(peerUserId) }
    val control = viewModel.control
    val offered by viewModel.offered.collectAsStateWithLifecycle()
    val withdrawn by control.withdrawn.collectAsStateWithLifecycle()
    val phase by control.sender.phase.collectAsStateWithLifecycle()
    val waking by control.sender.waking.collectAsStateWithLifecycle()
    val notice by control.sender.notice.collectAsStateWithLifecycle()
    val speaking by viewModel.speaking.collectAsStateWithLifecycle()
    val pressed = remember(peerUserId) { mutableStateOf(false) }
    val permissions = rememberPermissionFlow()
    val context = LocalContext.current
    TalkieNoticeEffect(notice, control::present)
    LaunchedEffect(waking) {
        // L'en-tête n'a pas de libellé : le réveil d'un destinataire hors ligne se dit dans un bandeau neutre.
        if (waking) control.inform(context.getString(UiR.string.talkie_send_waking, peerName))
    }
    val look = TalkieHoldLook.resolve(pressed.value, phase)
    val voice = TalkieHeaderVoice.resolve(look, peerSpeaking = peerUserId in speaking)
    val secondary = remember(accent) { secondaryOf(accent) }
    val live = TalkieHeaderLive(voice, TalkieHeaderDelivery.resolve(voice, phase, waking), accent, secondary)
    val actions = remember(control, peerUserId) {
        TalkieHoldActions(
            press = { control.press(peerUserId) },
            release = control::release,
            quickTap = { control.inform(context.getString(UiR.string.talkie_send_hold)) },
        )
    }
    val button: @Composable () -> Unit = {
        PermissionFlowHost(permissions, accent = accent)
        AnimatedVisibility(visible = offered && !withdrawn, enter = scaleIn() + fadeIn(), exit = scaleOut() + fadeOut()) {
            TalkieGlyph(look, phase, waking, peerName, accent, secondary, pressed, permissions, actions)
        }
    }
    return ChatHeaderTalkie(live, button)
}

@Composable
private fun TalkieGlyph(
    look: TalkieHoldLook,
    phase: TalkieSendPhase,
    waking: Boolean,
    peerName: String,
    accent: Color,
    secondary: Color,
    pressed: androidx.compose.runtime.MutableState<Boolean>,
    permissions: PermissionFlow,
    actions: TalkieHoldActions,
) {
    val description = stringResource(UiR.string.talkie_send_hold_a11y, peerName)
    val hint = stringResource(UiR.string.talkie_send_hold_hint)
    val liveRes = TalkieWording.liveValue(phase, waking)
    val liveValue = if (TalkieWording.takesName(liveRes)) stringResource(liveRes, peerName) else stringResource(liveRes)
    val gradient = Brush.linearGradient(listOf(accent, secondary))
    Box(
        modifier = Modifier
            .size(ChatHeaderMetrics.TAP_TARGET)
            .talkieHold(pressed, phase, permissions, actions)
            .semantics(mergeDescendants = true) {
                contentDescription = description
                stateDescription = if (look == TalkieHoldLook.LIVE) liveValue else hint
                role = Role.Button
            }
            .testTag(CHAT_HEADER_TALKIE_TAG),
        contentAlignment = Alignment.Center,
    ) {
        ChatHeaderGlassDisc(tint = accent, fill = gradient.takeUnless { look == TalkieHoldLook.IDLE }) {
            if (look == TalkieHoldLook.IDLE) {
                GradientIcon(MeeshyIcons.Sensors, gradient, Modifier.size(ChatHeaderMetrics.ACTION_GLYPH + 2.dp()))
            } else {
                Icon(
                    if (look == TalkieHoldLook.LIVE) MeeshyIcons.Waveform else MeeshyIcons.Sensors,
                    contentDescription = null,
                    tint = Color.White,
                    modifier = Modifier.size(ChatHeaderMetrics.ACTION_GLYPH + 2.dp()),
                )
            }
        }
    }
}

private fun Int.dp() = androidx.compose.ui.unit.Dp(toFloat())

/** Le secondaire de la conversation : le primaire tourné de +30° (iOS `ColorGeneration`). */
private fun secondaryOf(accent: Color): Color = runCatching {
    val hex = "#%06X".format(accent.toArgb() and 0xFFFFFF)
    Color(android.graphics.Color.parseColor(DynamicColorGenerator.hueShiftedHex(hex, 30.0)))
}.getOrDefault(accent)
