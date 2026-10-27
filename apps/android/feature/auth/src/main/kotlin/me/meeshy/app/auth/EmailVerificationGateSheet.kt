package me.meeshy.app.auth

import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.animateContentSize
import androidx.compose.animation.core.tween
import androidx.compose.animation.togetherWith
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.style.TextAlign
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import kotlinx.coroutines.delay
import me.meeshy.feature.auth.R
import me.meeshy.sdk.net.EmailGateReason
import me.meeshy.ui.component.auth.AuthActionButton
import me.meeshy.ui.component.auth.AuthContentType
import me.meeshy.ui.component.auth.AuthTextField
import me.meeshy.ui.haptics.rememberMeeshyHaptics
import me.meeshy.ui.icons.MeeshyIcons
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme
import me.meeshy.sdk.auth.EmailGateRequest

private const val CODE_FOCUS_DELAY_MS = 350L
private const val STEP_FADE_MS = 220

/**
 * La validation de l'e-mail, présentée par-dessus TOUT (iOS `EmailVerificationGateView`, #8365) : la phrase qui
 * dit POURQUOI (« Pour publier, validez votre adresse. Votre publication est conservée et partira dès le code
 * validé. »), puis l'adresse — le code part dès l'ouverture, sa saisie se fait SUR PLACE.
 *
 * Glisser la feuille vaut « Plus tard ». Le bouton d'envoi cède la place à la saisie en fondu ; l'erreur entre,
 * secoue le téléphone et est annoncée par TalkBack ([AuthErrorMessage]) ; le code se propose à l'autofill SMS/e-mail.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun EmailVerificationGateSheet(
    request: EmailGateRequest,
    viewModel: EmailVerificationGateViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    val haptics = rememberMeeshyHaptics()
    LaunchedEffect(request) { viewModel.begin(request) }
    val sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)
    val focus = remember { FocusRequester() }
    LaunchedEffect(state.sent) {
        if (state.sent) {
            delay(CODE_FOCUS_DELAY_MS)
            runCatching { focus.requestFocus() }
        }
    }
    val tokens = MeeshyTheme.tokens

    ModalBottomSheet(
        onDismissRequest = viewModel::later,
        sheetState = sheetState,
        containerColor = tokens.backgroundPrimary,
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .verticalScroll(rememberScrollState())
                .padding(horizontal = MeeshySpacing.xxl, vertical = MeeshySpacing.lg)
                .animateContentSize(tween(STEP_FADE_MS)),
            verticalArrangement = Arrangement.spacedBy(MeeshySpacing.xl),
        ) {
            Column(verticalArrangement = Arrangement.spacedBy(MeeshySpacing.smPlus)) {
                Text(
                    text = stringResource(R.string.email_gate_title),
                    style = MaterialTheme.typography.titleLarge,
                    fontWeight = FontWeight.Bold,
                    color = tokens.textPrimary,
                    modifier = Modifier.semantics { heading() },
                )
                Text(
                    text = stringResource(leadRes(request.reason)),
                    style = MaterialTheme.typography.bodyMedium,
                    color = tokens.textSecondary,
                )
            }
            Column(verticalArrangement = Arrangement.spacedBy(MeeshySpacing.md)) {
                Text(
                    text = stringResource(R.string.email_gate_label),
                    style = MaterialTheme.typography.bodyLarge,
                    fontWeight = FontWeight.SemiBold,
                    color = tokens.textPrimary,
                )
                AnimatedContent(
                    targetState = state.sent,
                    transitionSpec = { fadeIn(tween(STEP_FADE_MS)) togetherWith fadeOut(tween(STEP_FADE_MS)) },
                    label = "emailGateStep",
                ) { sent ->
                    if (sent) {
                        CodeStep(state = state, focus = focus, viewModel = viewModel)
                    } else {
                        Column(verticalArrangement = Arrangement.spacedBy(MeeshySpacing.md)) {
                            AuthErrorMessage(text = state.errorRes?.let { stringResource(it) })
                            AuthActionButton(
                                title = stringResource(if (state.isSending) R.string.email_gate_sending else R.string.email_gate_send),
                                onClick = {
                                    haptics.light()
                                    viewModel.sendCode()
                                },
                                enabled = !state.isSending,
                                isLoading = state.isSending,
                                modifier = Modifier.fillMaxWidth(),
                            )
                        }
                    }
                }
            }
            TextButton(onClick = viewModel::later, modifier = Modifier.fillMaxWidth()) {
                Text(
                    text = stringResource(R.string.email_gate_later),
                    style = MaterialTheme.typography.bodyLarge,
                    fontWeight = FontWeight.SemiBold,
                    color = MeeshyPalette.Indigo400,
                    textAlign = TextAlign.Center,
                )
            }
        }
    }
}

@Composable
private fun CodeStep(state: EmailGateUiState, focus: FocusRequester, viewModel: EmailVerificationGateViewModel) {
    val fieldLabel = stringResource(R.string.email_verification_code_a11y_label)
    Column(verticalArrangement = Arrangement.spacedBy(MeeshySpacing.sm)) {
        Text(
            text = stringResource(R.string.email_gate_sent, state.request?.email.orEmpty()),
            style = MaterialTheme.typography.bodySmall,
            color = MeeshyTheme.tokens.textSecondary,
        )
        AuthTextField(
            value = state.code,
            onValueChange = viewModel::onCodeChange,
            title = stringResource(R.string.email_verification_code_placeholder),
            icon = MeeshyIcons.Mail,
            contentType = AuthContentType.OneTimeCode,
            imeAction = ImeAction.Go,
            onImeAction = viewModel::verify,
            enabled = !state.isSubmitting,
            modifier = Modifier
                .fillMaxWidth()
                .focusRequester(focus)
                .semantics { contentDescription = fieldLabel },
        )
        AuthErrorMessage(text = state.errorRes?.let { stringResource(it) } ?: state.errorMessage)
        AuthActionButton(
            title = stringResource(R.string.email_verification_verify_button),
            onClick = viewModel::verify,
            enabled = state.canSubmit,
            isLoading = state.isSubmitting,
            modifier = Modifier.fillMaxWidth(),
        )
        TextButton(
            onClick = viewModel::sendCode,
            enabled = !state.isSubmitting && !state.isSending && !state.resendConfirmed,
        ) {
            Text(
                text = stringResource(
                    if (state.resendConfirmed) R.string.email_verification_resend_confirmed else R.string.email_verification_resend_button,
                ),
                fontWeight = FontWeight.SemiBold,
            )
        }
    }
}

private fun leadRes(reason: EmailGateReason): Int = when (reason) {
    EmailGateReason.PUBLISH -> R.string.email_gate_publish
    EmailGateReason.INVITE -> R.string.email_gate_invite
    EmailGateReason.LINK -> R.string.email_gate_link
    EmailGateReason.MORE_LINKS -> R.string.email_gate_more_links
}
