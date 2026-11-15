package me.meeshy.app.auth

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.scaleIn
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.LifecycleResumeEffect
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import me.meeshy.feature.auth.R
import me.meeshy.sdk.model.auth.EmailVerificationLead
import me.meeshy.sdk.model.auth.LoginOutcome
import me.meeshy.ui.component.auth.SpamFolderHint
import me.meeshy.ui.icons.MeeshyIcons
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme

/**
 * La feuille « Vérifiez votre email » (iOS `EmailVerificationView`) : l'accroche selon le cas avec l'adresse en
 * gras, [EmailCodeEntry], le renvoi, la surveillance d'une preuve faite ailleurs (au premier plan seulement) et
 * la coche « Email vérifié ! ». [onVerified] reçoit l'issue de la preuve une fois la pause de succès écoulée :
 * c'est le point d'accroche de l'hôte (ouverture de la session, fête d'arrivée).
 */
@Composable
internal fun EmailVerificationSheet(
    viewModel: EmailVerificationViewModel,
    onVerified: (LoginOutcome) -> Unit,
    onClose: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    val latestOnVerified by rememberUpdatedState(onVerified)
    LaunchedEffect(viewModel) {
        viewModel.effect.collect { effect ->
            if (effect is EmailVerificationEffect.Verified) latestOnVerified(effect.outcome)
        }
    }
    LifecycleResumeEffect(viewModel) {
        viewModel.onEvent(EmailVerificationEvent.WatchStarted)
        onPauseOrDispose { viewModel.onEvent(EmailVerificationEvent.WatchStopped) }
    }
    val tokens = MeeshyTheme.tokens
    Column(
        modifier = modifier.fillMaxWidth(),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(MeeshySpacing.sm),
    ) {
        if (state.verified) {
            EmailVerifiedCheck()
            return@Column
        }
        Icon(MeeshyIcons.MailUnread, contentDescription = null, tint = MeeshyPalette.Indigo500, modifier = Modifier.size(48.dp))
        Text(
            text = stringResource(R.string.email_verification_title),
            style = MaterialTheme.typography.titleLarge,
            fontWeight = FontWeight.Bold,
            color = tokens.textPrimary,
            modifier = Modifier.semantics { heading() },
        )
        Text(
            text = leadSubtitle(state.lead, state.email),
            style = MaterialTheme.typography.bodyMedium,
            color = tokens.textMuted,
            textAlign = TextAlign.Center,
            modifier = Modifier.padding(horizontal = MeeshySpacing.md),
        )
        SpamFolderHint(textAlign = TextAlign.Center, modifier = Modifier.fillMaxWidth())
        EmailCodeEntry(
            code = state.code,
            gate = state.gate,
            error = state.error,
            provenElsewhere = state.provenElsewhere,
            onCodeChange = { viewModel.onEvent(EmailVerificationEvent.CodeChanged(it)) },
            onVerify = { viewModel.onEvent(EmailVerificationEvent.Verify) },
            modifier = Modifier.padding(top = MeeshySpacing.md),
        )
        ResendButton(
            isResending = state.isResending,
            confirmed = state.resendConfirmed,
            enabled = state.gate.canResend,
            onClick = { viewModel.onEvent(EmailVerificationEvent.Resend) },
        )
        TextButton(onClick = onClose, enabled = !state.isVerifying, modifier = Modifier.fillMaxWidth()) {
            Text(stringResource(R.string.email_verification_nav_close), color = tokens.textMuted)
        }
    }
}

@Composable
private fun ResendButton(isResending: Boolean, confirmed: Boolean, enabled: Boolean, onClick: () -> Unit) {
    val tokens = MeeshyTheme.tokens
    TextButton(
        onClick = onClick,
        enabled = enabled,
        modifier = Modifier.semantics { liveRegion = LiveRegionMode.Polite },
    ) {
        Row(horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.xs), verticalAlignment = Alignment.CenterVertically) {
            when {
                isResending -> {
                    CircularProgressIndicator(modifier = Modifier.size(16.dp), strokeWidth = 2.dp, color = MeeshyPalette.Indigo500)
                    Text(stringResource(R.string.email_verification_resending_a11y), fontWeight = FontWeight.SemiBold)
                }
                confirmed -> {
                    Icon(MeeshyIcons.CheckCircleFilled, contentDescription = null, tint = tokens.success, modifier = Modifier.size(18.dp))
                    Text(stringResource(R.string.email_verification_resend_confirmed), color = tokens.success, fontWeight = FontWeight.SemiBold)
                }
                else -> {
                    Icon(MeeshyIcons.Refresh, contentDescription = null, modifier = Modifier.size(18.dp))
                    Text(stringResource(R.string.email_verification_resend_button), fontWeight = FontWeight.SemiBold)
                }
            }
        }
    }
}

/** La coche « Email vérifié ! » qui entre en 0,3 s avant l'ouverture de la session. */
@Composable
private fun EmailVerifiedCheck() {
    val tokens = MeeshyTheme.tokens
    AnimatedVisibility(
        visible = true,
        enter = fadeIn(tween(SUCCESS_ENTER_MS)) + scaleIn(tween(SUCCESS_ENTER_MS), initialScale = 0.6f),
    ) {
        Column(
            modifier = Modifier.padding(vertical = MeeshySpacing.xl).semantics(mergeDescendants = true) { liveRegion = LiveRegionMode.Polite },
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(MeeshySpacing.md),
        ) {
            Icon(MeeshyIcons.CheckCircleFilled, contentDescription = null, tint = tokens.success, modifier = Modifier.size(64.dp))
            Text(
                text = stringResource(R.string.email_verification_success),
                style = MaterialTheme.typography.titleLarge,
                fontWeight = FontWeight.Bold,
                color = tokens.textPrimary,
            )
        }
    }
}

@Composable
private fun leadSubtitle(lead: EmailVerificationLead, email: String): AnnotatedString {
    val text = stringResource(
        when (lead) {
            EmailVerificationLead.ACCOUNT_CREATED -> R.string.email_verification_subtitle_account_created
            EmailVerificationLead.ACTIVATION_REQUIRED -> R.string.email_verification_subtitle_activation_required
            EmailVerificationLead.CODE_SENT -> R.string.email_verification_subtitle
        },
        email,
    )
    return buildAnnotatedString {
        append(text)
        val start = text.indexOf(email)
        if (start >= 0) addStyle(SpanStyle(fontWeight = FontWeight.Bold), start, start + email.length)
    }
}

private const val SUCCESS_ENTER_MS = 300
