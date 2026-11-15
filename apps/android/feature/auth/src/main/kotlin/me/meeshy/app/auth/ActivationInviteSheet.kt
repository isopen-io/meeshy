package me.meeshy.app.auth

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Text
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.focus.focusTarget
import androidx.compose.ui.draw.clip
import androidx.compose.ui.input.key.Key
import androidx.compose.ui.input.key.KeyEventType
import androidx.compose.ui.input.key.key
import androidx.compose.ui.input.key.onPreviewKeyEvent
import androidx.compose.ui.input.key.type
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import me.meeshy.feature.auth.R
import me.meeshy.sdk.model.UserActivation.Channel
import me.meeshy.sdk.model.auth.ActivationInvitePolicy
import me.meeshy.ui.theme.MeeshyGradients
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshyRadius
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme

object ActivationInviteSheetTags {
    const val SHEET = "activationInviteSheet"
    const val SEND_CODE = "activationInviteSendCode"
    const val ADD_PHONE = "activationInviteAddPhone"
    const val CLOSE = "activationInviteClose"
}

private val FormMaxWidth = 560.dp
private val ActionHeight = 48.dp
private val CloseHeight = 44.dp

/**
 * La feuille « Validez votre compte » (iOS `ActivationInviteView`, #8239). Ce qu'elle offre suit ce qui MANQUE :
 * « Recevoir le code » puis sa saisie SUR PLACE ([EmailCodeEntry]), « Ajouter mon numero » ouvre Parametres > Compte.
 * « Plus tard » ferme — aussi par le retour systeme et Echap au clavier physique. Formulaire borne sur tablette.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ActivationInviteSheet(
    state: ActivationInviteUiState,
    onEvent: (ActivationInviteEvent) -> Unit,
    modifier: Modifier = Modifier,
) {
    val tokens = MeeshyTheme.tokens
    val focus = remember { FocusRequester() }
    LaunchedEffect(Unit) { runCatching { focus.requestFocus() } }
    ModalBottomSheet(
        onDismissRequest = { onEvent(ActivationInviteEvent.Dismiss) },
        sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true),
        containerColor = tokens.backgroundPrimary,
    ) {
        Box(
            modifier = modifier
                .fillMaxWidth()
                .testTag(ActivationInviteSheetTags.SHEET)
                .focusRequester(focus)
                .focusTarget()
                .onPreviewKeyEvent {
                    val escape = it.key == Key.Escape && it.type == KeyEventType.KeyUp
                    if (escape) onEvent(ActivationInviteEvent.Dismiss)
                    escape
                },
            contentAlignment = Alignment.TopCenter,
        ) {
            Column(
                modifier = Modifier
                    .widthIn(max = FormMaxWidth)
                    .fillMaxWidth()
                    .verticalScroll(rememberScrollState())
                    .padding(horizontal = MeeshySpacing.xxl, vertical = MeeshySpacing.lg),
                verticalArrangement = Arrangement.spacedBy(MeeshySpacing.xxl),
            ) {
                Header(state)
                ProofLines(state)
                if (Channel.EMAIL in state.invite.missing && state.invite.email != null) EmailStep(state, onEvent)
                if (Channel.PHONE in state.invite.missing) PhoneStep(onEvent)
                if (state.invite.isComplete) {
                    Text(
                        text = stringResource(R.string.activation_complete),
                        style = MaterialTheme.typography.bodyLarge,
                        fontWeight = FontWeight.SemiBold,
                        color = tokens.success,
                    )
                }
                CloseButton(isComplete = state.invite.isComplete, onClose = { onEvent(ActivationInviteEvent.Dismiss) })
            }
        }
    }
}

@Composable
private fun Header(state: ActivationInviteUiState) {
    val tokens = MeeshyTheme.tokens
    Column(verticalArrangement = Arrangement.spacedBy(MeeshySpacing.smPlus)) {
        Text(
            text = stringResource(R.string.activation_invite_title),
            style = MaterialTheme.typography.titleLarge,
            fontWeight = FontWeight.Bold,
            color = tokens.textPrimary,
            modifier = Modifier.semantics { heading() },
        )
        Text(
            text = when (val lead = ActivationInvitePolicy.lead(state.daysLeft)) {
                ActivationInvitePolicy.Lead.Open -> stringResource(R.string.activation_invite_lead)
                ActivationInvitePolicy.Lead.OneDay -> stringResource(R.string.activation_invite_days_left_one)
                is ActivationInvitePolicy.Lead.Days -> stringResource(R.string.activation_invite_days_left, lead.days)
            },
            style = MaterialTheme.typography.bodyMedium,
            color = tokens.textSecondary,
        )
    }
}

@Composable
private fun ProofLines(state: ActivationInviteUiState) {
    if (Channel.EMAIL in state.invite.proven) ProofLine(stringResource(R.string.activation_email_done))
    if (Channel.PHONE in state.invite.proven) ProofLine(stringResource(R.string.activation_phone_done))
}

@Composable
private fun ProofLine(text: String) {
    Text(
        text = text,
        style = MaterialTheme.typography.bodySmall,
        fontWeight = FontWeight.SemiBold,
        color = MeeshyTheme.tokens.success,
    )
}

@Composable
private fun EmailStep(state: ActivationInviteUiState, onEvent: (ActivationInviteEvent) -> Unit) {
    val tokens = MeeshyTheme.tokens
    Column(verticalArrangement = Arrangement.spacedBy(MeeshySpacing.md)) {
        Text(
            text = stringResource(R.string.activation_email_label),
            style = MaterialTheme.typography.bodyLarge,
            fontWeight = FontWeight.SemiBold,
            color = tokens.textPrimary,
        )
        if (state.emailSent) {
            Text(
                text = stringResource(R.string.activation_email_sent, state.invite.email.orEmpty()),
                style = MaterialTheme.typography.bodySmall,
                color = tokens.textSecondary,
            )
            EmailCodeEntry(
                code = state.code,
                gate = state.gate,
                error = state.error,
                provenElsewhere = false,
                onCodeChange = { onEvent(ActivationInviteEvent.CodeChanged(it)) },
                onVerify = { onEvent(ActivationInviteEvent.Verify) },
            )
        } else {
            AuthErrorMessage(text = state.error?.let { stringResource(it.messageRes()) })
            val sending = state.gate.isResending
            ActionButton(
                label = stringResource(if (sending) R.string.activation_email_sending else R.string.activation_email_send),
                enabled = !sending,
                tag = ActivationInviteSheetTags.SEND_CODE,
                filled = true,
                onClick = { onEvent(ActivationInviteEvent.SendCode) },
            )
        }
    }
}

@Composable
private fun PhoneStep(onEvent: (ActivationInviteEvent) -> Unit) {
    Column(verticalArrangement = Arrangement.spacedBy(MeeshySpacing.md)) {
        Text(
            text = stringResource(R.string.activation_phone_label),
            style = MaterialTheme.typography.bodyLarge,
            fontWeight = FontWeight.SemiBold,
            color = MeeshyTheme.tokens.textPrimary,
        )
        ActionButton(
            label = stringResource(R.string.activation_phone_add),
            enabled = true,
            tag = ActivationInviteSheetTags.ADD_PHONE,
            filled = false,
            onClick = { onEvent(ActivationInviteEvent.AddPhone) },
        )
    }
}

/** 48 dp, rayon md : degrade de marque (« Recevoir le code ») ou contour indigo400 (« Ajouter mon numero »). */
@Composable
private fun ActionButton(label: String, enabled: Boolean, tag: String, filled: Boolean, onClick: () -> Unit) {
    val shape = RoundedCornerShape(MeeshyRadius.md)
    val base = Modifier
        .fillMaxWidth()
        .heightIn(min = ActionHeight)
        .testTag(tag)
        .clip(shape)
    val styled = if (filled) {
        base.background(MeeshyGradients.brand)
    } else {
        base.border(BorderStroke(2.dp, MeeshyPalette.Indigo400.copy(alpha = 0.6f)), shape)
    }
    Box(
        modifier = styled
            .clickable(enabled = enabled, role = Role.Button, onClick = onClick)
            .semantics { role = Role.Button },
        contentAlignment = Alignment.Center,
    ) {
        Text(
            text = label,
            style = MaterialTheme.typography.titleMedium,
            fontWeight = FontWeight.Bold,
            color = if (filled) MeeshyPalette.White else MeeshyTheme.tokens.textPrimary,
            textAlign = TextAlign.Center,
        )
    }
}

@Composable
private fun CloseButton(isComplete: Boolean, onClose: () -> Unit) {
    Box(
        modifier = Modifier
            .fillMaxWidth()
            .heightIn(min = CloseHeight)
            .testTag(ActivationInviteSheetTags.CLOSE)
            .clickable(role = Role.Button, onClick = onClose),
        contentAlignment = Alignment.Center,
    ) {
        Text(
            text = stringResource(if (isComplete) R.string.activation_close else R.string.activation_later),
            style = MaterialTheme.typography.bodyLarge,
            fontWeight = FontWeight.SemiBold,
            color = MeeshyPalette.Indigo400,
        )
    }
}
