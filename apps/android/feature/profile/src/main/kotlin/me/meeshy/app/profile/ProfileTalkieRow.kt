package me.meeshy.app.profile

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.stateDescription
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import me.meeshy.sdk.model.relation.TalkieHoldLook
import me.meeshy.sdk.model.relation.TalkieSendPhase
import me.meeshy.ui.R as UiR
import me.meeshy.ui.component.permission.PermissionFlowHost
import me.meeshy.ui.component.permission.rememberPermissionFlow
import me.meeshy.ui.component.talkie.TalkieHoldActions
import me.meeshy.ui.component.talkie.TalkieInfoButton
import me.meeshy.ui.component.talkie.TalkieInfoNote
import me.meeshy.ui.component.talkie.TalkieNoticeEffect
import me.meeshy.ui.component.talkie.TalkieWording
import me.meeshy.ui.component.talkie.talkieHold
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme
import me.meeshy.ui.icons.MeeshyIcons

internal const val PROFILE_TALKIE_SEND_TAG = "talkie.send"

/**
 * « Maintenir pour parler » sur la fiche d'un Proche ou d'un Sang (#17150, iso `ProfileTalkieRow.swift`) : on MAINTIENT,
 * on parle, on relâche — la voix sort chez l'autre sans qu'il ait à décrocher.
 *
 * - Présent dès Proche ; la passerelle rejuge à chaque appui et un `TALKIE_NOT_ALLOWED` retire la ligne, ni grisée ni
 *   expliquée.
 * - Relâcher, glisser hors du doigt ou quitter la fiche termine la prise de parole.
 * - Les refus se disent sans fuite : un blocage et un repli rendent la même INFORMATION, jamais en rouge.
 * - Un destinataire hors ligne se réveille : « Réveil de X… » ; le (i) dit l'usage d'urgence.
 */
@Composable
internal fun ProfileTalkieRow(
    userId: String,
    displayName: String,
    viewModel: ProfileTalkieViewModel = hiltViewModel(key = "talkie-$userId"),
) {
    val control = viewModel.control
    val withdrawn by control.withdrawn.collectAsStateWithLifecycle()
    if (withdrawn) return
    val phase by control.sender.phase.collectAsStateWithLifecycle()
    val waking by control.sender.waking.collectAsStateWithLifecycle()
    val notice by control.sender.notice.collectAsStateWithLifecycle()
    val context = LocalContext.current
    val permissions = rememberPermissionFlow()
    val pressed = remember { mutableStateOf(false) }
    var infoOpen by remember { mutableStateOf(false) }
    TalkieNoticeEffect(notice, control::present)
    PermissionFlowHost(permissions)
    val actions = remember(control, userId) {
        TalkieHoldActions(
            press = { control.press(userId) },
            release = control::release,
            quickTap = { control.inform(context.getString(UiR.string.talkie_send_hold)) },
        )
    }
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(10.dp))
            .background(MeeshyPalette.Indigo500.copy(alpha = 0.08f))
            .padding(MeeshySpacing.md),
        verticalArrangement = Arrangement.spacedBy(MeeshySpacing.sm),
    ) {
        Text(
            text = stringResource(UiR.string.talkie_send_explain, displayName),
            style = MaterialTheme.typography.bodySmall,
            color = MeeshyTheme.tokens.textSecondary,
        )
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.xs)) {
            val live = TalkieHoldLook.resolve(pressed.value, phase) != TalkieHoldLook.IDLE
            HoldButton(
                live = live,
                label = label(phase, waking, displayName),
                a11yName = displayName,
                modifier = Modifier
                    .weight(1f)
                    .talkieHold(pressed, phase, permissions, actions),
            )
            TalkieInfoButton(expanded = infoOpen, onToggle = { infoOpen = !infoOpen })
        }
        if (infoOpen) TalkieInfoNote()
    }
}

@Composable
private fun label(phase: TalkieSendPhase, waking: Boolean, name: String): String {
    val res = TalkieWording.label(phase, waking)
    return if (TalkieWording.takesName(res)) stringResource(res, name) else stringResource(res)
}

@Composable
private fun HoldButton(live: Boolean, label: String, a11yName: String, modifier: Modifier) {
    val description = stringResource(UiR.string.talkie_send_hold_a11y, a11yName)
    val hint = stringResource(UiR.string.talkie_send_hold_hint)
    val tint = if (live) Color.White else MeeshyPalette.Indigo500
    Row(
        modifier = modifier
            .heightIn(min = 48.dp)
            .clip(CircleShape)
            .background(if (live) MeeshyPalette.Indigo500 else Color.Transparent)
            .border(BorderStroke(1.5.dp, MeeshyPalette.Indigo500), CircleShape)
            .semantics(mergeDescendants = true) {
                contentDescription = description
                stateDescription = if (live) label else hint
                role = Role.Button
            }
            .testTag(PROFILE_TALKIE_SEND_TAG)
            .padding(horizontal = MeeshySpacing.lg, vertical = MeeshySpacing.sm),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.sm, Alignment.CenterHorizontally),
    ) {
        Icon(if (live) MeeshyIcons.Waveform else MeeshyIcons.Mic, contentDescription = null, tint = tint)
        Text(text = label, style = MaterialTheme.typography.bodyMedium, fontWeight = FontWeight.Bold, color = tint)
    }
}
