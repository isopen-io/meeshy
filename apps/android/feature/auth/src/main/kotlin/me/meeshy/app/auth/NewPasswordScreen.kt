package me.meeshy.app.auth

import androidx.annotation.StringRes
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import me.meeshy.feature.auth.R
import me.meeshy.sdk.model.auth.PasswordResetFlow
import me.meeshy.ui.component.auth.AuthActionButton
import me.meeshy.ui.component.auth.AuthContentType
import me.meeshy.ui.component.auth.AuthTextField
import me.meeshy.ui.component.auth.PasswordStrengthIndicator
import me.meeshy.ui.icons.MeeshyIcons
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme

private val HERO_ICON = 56.dp

/**
 * « Nouveau mot de passe » (iOS `MeeshyNewPasswordView`) : la dernière étape de « Mot de passe oublié », ouverte par le
 * lien de l'e-mail. Une feuille, comme sur iOS : croix et glissé vers le bas ferment. Quatre pages selon
 * [PasswordResetFlow.Phase] — la saisie, « Mot de passe enregistré », le lien mort, les codes épuisés.
 *
 * [onSignIn] referme la feuille (la porte d'accès est dessous) ; [onRequestNewLink] la remplace par « Mot de passe
 * oublié ». Le texte du formulaire ne quitte jamais l'écran : aucun journal, aucune sauvegarde.
 */
@Composable
fun NewPasswordScreen(
    onClose: () -> Unit,
    onSignIn: () -> Unit,
    onRequestNewLink: () -> Unit,
    viewModel: NewPasswordViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsStateWithLifecycle()

    RecoveryScaffold(title = stringResource(R.string.newpw_title), onBack = onClose) {
        when (state.flow.phase) {
            PasswordResetFlow.Phase.FORM -> NewPasswordForm(state, viewModel)
            PasswordResetFlow.Phase.SAVED -> SavedPage(onSignIn)
            PasswordResetFlow.Phase.LINK_INVALID -> DeadLinkPage(exhausted = false, onRequestNewLink = onRequestNewLink)
            PasswordResetFlow.Phase.ATTEMPTS_EXHAUSTED -> DeadLinkPage(exhausted = true, onRequestNewLink = onRequestNewLink)
        }
    }
}

@Composable
private fun NewPasswordForm(state: NewPasswordUiState, viewModel: NewPasswordViewModel) {
    val tokens = MeeshyTheme.tokens
    AuthTextField(
        value = state.newPassword,
        onValueChange = viewModel::onNewPasswordChange,
        title = stringResource(R.string.newpw_new),
        icon = MeeshyIcons.Lock,
        isSecure = true,
        contentType = AuthContentType.NewPassword,
        enabled = !state.isLoading,
    )
    PasswordStrengthIndicator(password = state.newPassword)
    AuthTextField(
        value = state.confirmPassword,
        onValueChange = viewModel::onConfirmPasswordChange,
        title = stringResource(R.string.newpw_confirm),
        icon = MeeshyIcons.Lock,
        isSecure = true,
        contentType = AuthContentType.NewPassword,
        imeAction = if (state.flow.requiresSecondFactor) ImeAction.Next else ImeAction.Done,
        onImeAction = { if (!state.flow.requiresSecondFactor && state.canSubmit) viewModel.submit() },
        enabled = !state.isLoading,
        errorText = if (state.showsMismatch) stringResource(R.string.newpw_mismatch) else null,
    )
    if (state.flow.requiresSecondFactor) {
        AuthTextField(
            value = state.code,
            onValueChange = viewModel::onCodeChange,
            title = stringResource(R.string.newpw_code),
            icon = MeeshyIcons.Key,
            contentType = AuthContentType.OneTimeCode,
            imeAction = ImeAction.Done,
            onImeAction = { if (state.canSubmit) viewModel.submit() },
            enabled = !state.isLoading,
        )
        Text(
            text = stringResource(R.string.newpw_code_lead),
            style = MaterialTheme.typography.bodySmall,
            color = tokens.textSecondary,
            textAlign = TextAlign.Center,
            modifier = Modifier.fillMaxWidth(),
        )
    }
    AuthErrorMessage(text = state.flow.notice?.let { noticeText(it) })
    AuthActionButton(
        title = stringResource(R.string.newpw_save),
        onClick = viewModel::submit,
        enabled = state.canSubmit,
        isLoading = state.isLoading,
    )
}

@Composable
private fun noticeText(notice: PasswordResetFlow.Notice): String = when (notice) {
    PasswordResetFlow.Notice.SecondFactorRequired -> stringResource(R.string.newpw_err_code_required)
    PasswordResetFlow.Notice.SecondFactorInvalid -> stringResource(R.string.newpw_err_code_invalid)
    PasswordResetFlow.Notice.WeakPassword -> stringResource(R.string.newpw_err_weak)
    PasswordResetFlow.Notice.ReusedPassword -> stringResource(R.string.newpw_err_reused)
    PasswordResetFlow.Notice.AccountLocked -> stringResource(R.string.newpw_err_locked)
    PasswordResetFlow.Notice.RateLimited -> stringResource(R.string.newpw_err_rate_limited)
    PasswordResetFlow.Notice.Offline -> stringResource(R.string.newpw_err_offline)
    is PasswordResetFlow.Notice.Failed -> stringResource(R.string.newpw_err_failed) + " (${notice.reference})"
}

@Composable
private fun SavedPage(onSignIn: () -> Unit) {
    StatusPage(
        icon = MeeshyIcons.CheckCircle,
        iconTint = MeeshyTheme.tokens.success,
        title = R.string.newpw_saved,
        text = null,
    )
    AuthActionButton(title = stringResource(R.string.newpw_signin), onClick = onSignIn)
}

@Composable
private fun DeadLinkPage(exhausted: Boolean, onRequestNewLink: () -> Unit) {
    StatusPage(
        icon = if (exhausted) MeeshyIcons.Shield else MeeshyIcons.Link,
        iconTint = MeeshyTheme.tokens.error,
        title = if (exhausted) R.string.newpw_exhausted_title else R.string.newpw_dead_title,
        text = if (exhausted) R.string.newpw_exhausted_text else R.string.newpw_dead_text,
    )
    AuthActionButton(title = stringResource(R.string.newpw_dead_action), onClick = onRequestNewLink)
}

@Composable
private fun StatusPage(
    icon: androidx.compose.ui.graphics.vector.ImageVector,
    iconTint: androidx.compose.ui.graphics.Color,
    @StringRes title: Int,
    @StringRes text: Int?,
) {
    Column(
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(MeeshySpacing.md),
        modifier = Modifier.fillMaxWidth().padding(vertical = MeeshySpacing.lg),
    ) {
        Icon(imageVector = icon, contentDescription = null, tint = iconTint, modifier = Modifier.size(HERO_ICON))
        Text(
            text = stringResource(title),
            style = MaterialTheme.typography.titleLarge,
            color = MeeshyTheme.tokens.textPrimary,
            fontWeight = FontWeight.Bold,
            textAlign = TextAlign.Center,
            modifier = Modifier.semantics { heading() },
        )
        if (text != null) {
            Text(
                text = stringResource(text),
                style = MaterialTheme.typography.bodyMedium,
                color = MeeshyTheme.tokens.textSecondary,
                textAlign = TextAlign.Center,
            )
        }
    }
}
