package me.meeshy.app.auth

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.text.BasicText
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.unit.dp
import me.meeshy.feature.auth.R
import me.meeshy.sdk.model.auth.SavedAccount
import me.meeshy.ui.component.MeeshyAvatar
import me.meeshy.ui.component.auth.AuthActionButton
import me.meeshy.ui.component.auth.AuthContentType
import me.meeshy.ui.component.auth.AuthTextField
import me.meeshy.ui.icons.MeeshyIcons
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme

/** The selected account's password prompt — iOS `LoginView.selectedAccountView`. */
@Composable
internal fun SelectedAccountForm(
    account: SavedAccount,
    state: AuthUiState,
    viewModel: AuthViewModel,
    modifier: Modifier = Modifier,
) {
    Column(modifier = modifier, horizontalAlignment = Alignment.CenterHorizontally) {
        Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.fillMaxWidth()) {
            IconButton(onClick = viewModel::deselectAccount) {
                Icon(MeeshyIcons.Back, contentDescription = stringResource(R.string.registration_back))
            }
            Spacer(modifier = Modifier.width(MeeshySpacing.sm))
            MeeshyAvatar(name = account.shortName, size = 40.dp, imageUrl = account.avatarUrl)
            Column(modifier = Modifier.padding(start = MeeshySpacing.md)) {
                Text(
                    text = account.shortName,
                    style = MaterialTheme.typography.bodyMedium,
                    fontWeight = FontWeight.SemiBold,
                    color = MeeshyTheme.tokens.textPrimary,
                )
                Text(
                    text = "@${account.username}",
                    style = MaterialTheme.typography.bodySmall,
                    color = MeeshyTheme.tokens.textMuted,
                )
            }
        }

        LoginPasswordField(
            value = state.password,
            onValueChange = viewModel::onPasswordChange,
            enabled = !state.isSubmitting,
            onGo = viewModel::login,
            modifier = Modifier.fillMaxWidth().padding(top = MeeshySpacing.lg),
        )

        KeepSignedInToggle(state = state, onChange = viewModel::onKeepSignedInChange)

        AuthErrorMessage(
            text = state.errorRes?.let { stringResource(it) } ?: state.errorMessage,
            modifier = Modifier.padding(top = MeeshySpacing.md),
        )

        AuthActionButton(
            title = stringResource(R.string.login_button),
            onClick = viewModel::login,
            enabled = state.canSubmit,
            isLoading = state.isSubmitting,
            modifier = Modifier.fillMaxWidth().padding(top = MeeshySpacing.xl),
        )
    }
}

/**
 * The plain credential form — iOS `LoginView.normalLoginSection`, with the recovery links
 * stacked under the button: the passwordless sign-in first (the highlighted action), the
 * forgotten password below it, muted.
 */
@Composable
internal fun NormalLoginForm(
    state: AuthUiState,
    viewModel: AuthViewModel,
    showBackToPicker: Boolean,
    onForgotPassword: () -> Unit,
    onMagicLink: () -> Unit,
) {
    if (showBackToPicker) {
        Row(
            verticalAlignment = Alignment.CenterVertically,
            modifier = Modifier.fillMaxWidth(),
        ) {
            TextButton(onClick = viewModel::backToSavedAccounts) {
                Icon(MeeshyIcons.Back, contentDescription = null, tint = MeeshyTheme.tokens.textMuted)
                Text(
                    text = stringResource(R.string.login_saved_accounts),
                    style = MaterialTheme.typography.bodySmall,
                    fontWeight = FontWeight.Medium,
                    color = MeeshyTheme.tokens.textMuted,
                    modifier = Modifier.padding(start = MeeshySpacing.xs),
                )
            }
        }
    }

    AuthTextField(
        value = state.username,
        onValueChange = viewModel::onUsernameChange,
        title = stringResource(R.string.login_username_label),
        icon = MeeshyIcons.Person,
        contentType = AuthContentType.Username,
        imeAction = ImeAction.Next,
        enabled = !state.isSubmitting,
        modifier = Modifier
            .fillMaxWidth()
            .padding(top = if (showBackToPicker) MeeshySpacing.md else MeeshySpacing.none),
    )

    LoginPasswordField(
        value = state.password,
        onValueChange = viewModel::onPasswordChange,
        enabled = !state.isSubmitting,
        onGo = viewModel::login,
        modifier = Modifier
            .fillMaxWidth()
            .padding(top = MeeshySpacing.md),
    )

    KeepSignedInToggle(state = state, onChange = viewModel::onKeepSignedInChange)

    AuthErrorMessage(
        text = state.errorRes?.let { stringResource(it) } ?: state.errorMessage,
        modifier = Modifier.padding(top = MeeshySpacing.md),
    )

    AuthActionButton(
        title = stringResource(R.string.login_button),
        onClick = viewModel::login,
        enabled = state.canSubmit,
        isLoading = state.isSubmitting,
        modifier = Modifier
            .fillMaxWidth()
            .padding(top = MeeshySpacing.xl),
    )

    LoginRecoveryLinks(
        enabled = !state.isSubmitting,
        onForgotPassword = onForgotPassword,
        onMagicLink = onMagicLink,
        modifier = Modifier.padding(top = MeeshySpacing.xs),
    )
}

@Composable
private fun LoginRecoveryLinks(
    enabled: Boolean,
    onForgotPassword: () -> Unit,
    onMagicLink: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Column(modifier = modifier, horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(0.dp)) {
        TextButton(onClick = onMagicLink, enabled = enabled) {
            Icon(
                imageVector = MeeshyIcons.MagicWand,
                contentDescription = null,
                tint = MeeshyPalette.Purple500,
                modifier = Modifier.size(16.dp),
            )
            BasicText(
                text = stringResource(R.string.login_magic_link),
                style = MaterialTheme.typography.bodyMedium.merge(
                    TextStyle(
                        brush = Brush.horizontalGradient(listOf(MeeshyPalette.Purple500, MeeshyPalette.Indigo400)),
                        fontWeight = FontWeight.SemiBold,
                    ),
                ),
                modifier = Modifier.padding(start = MeeshySpacing.xs),
            )
        }
        TextButton(onClick = onForgotPassword, enabled = enabled) {
            Text(
                text = stringResource(R.string.login_forgot_password),
                style = MaterialTheme.typography.bodyMedium,
                fontWeight = FontWeight.Medium,
                color = MeeshyTheme.tokens.textMuted,
            )
        }
    }
}

/** « Pas de compte ? Créer un compte » — le lien discret en dégradé (iOS `LoginView`, pied de page). */
@Composable
internal fun LoginSignupLink(enabled: Boolean, onSignUp: () -> Unit, modifier: Modifier = Modifier) {
    TextButton(onClick = onSignUp, enabled = enabled, modifier = modifier) {
        Text(
            text = stringResource(R.string.login_signup_prompt),
            style = MaterialTheme.typography.bodyMedium,
            color = MeeshyTheme.tokens.textMuted,
        )
        BasicText(
            text = stringResource(R.string.login_signup_link),
            style = MaterialTheme.typography.bodyMedium.merge(
                TextStyle(
                    brush = Brush.horizontalGradient(listOf(MeeshyPalette.Purple700, MeeshyPalette.Purple600)),
                    fontWeight = FontWeight.SemiBold,
                ),
            ),
            modifier = Modifier.padding(start = MeeshySpacing.xs),
        )
    }
}
