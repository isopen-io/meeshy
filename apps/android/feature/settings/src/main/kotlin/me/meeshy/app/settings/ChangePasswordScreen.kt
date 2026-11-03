package me.meeshy.app.settings

import me.meeshy.ui.icons.MeeshyIcons
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.RadioButtonUnchecked
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import me.meeshy.feature.settings.R
import me.meeshy.sdk.model.ChangePasswordValidation
import me.meeshy.ui.component.auth.AuthContentType
import me.meeshy.ui.component.auth.AuthTextField
import me.meeshy.ui.component.auth.PasswordStrengthIndicator
import me.meeshy.ui.component.chrome.CollapsibleHeaderPage
import me.meeshy.ui.component.chrome.MeeshyBackground
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshyRadius
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme
import me.meeshy.ui.theme.formColumnWidth

/**
 * Change-password screen (feature-parity §L) — port of iOS `ChangePasswordView`.
 * Current + new + confirm fields with per-field visibility toggles, a live 5-bar
 * strength meter, per-rule validation hints, and a submit gated on
 * [ChangePasswordValidation.canSubmit]. Pure glue over [ChangePasswordViewModel];
 * all decision logic lives in the tested SSOTs.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ChangePasswordScreen(
    onBack: () -> Unit,
    viewModel: ChangePasswordViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsStateWithLifecycle()

    // On success, briefly show the confirmation then leave.
    LaunchedEffect(state.isSuccess) {
        if (state.isSuccess) onBack()
    }

    MeeshyBackground {
        CollapsibleHeaderPage(
            title = stringResource(R.string.change_password_title),
            onBack = onBack,
            titleColor = MeeshyTheme.tokens.textPrimary,
            backArrowColor = MeeshyPalette.Indigo500,
            backgroundColor = MeeshyTheme.tokens.backgroundPrimary,
        ) {
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .formColumnWidth()
                    .padding(horizontal = MeeshySpacing.lg, vertical = MeeshySpacing.md),
                verticalArrangement = Arrangement.spacedBy(MeeshySpacing.lg),
            ) {
                if (state.asksCurrentPassword) {
                    AuthTextField(
                        value = state.currentPassword,
                        onValueChange = viewModel::onCurrentPasswordChange,
                        title = stringResource(R.string.change_password_current_label),
                        icon = MeeshyIcons.Lock,
                        isSecure = true,
                        contentType = AuthContentType.Password,
                        enabled = !state.isSaving,
                    )
                }

                AuthTextField(
                    value = state.newPassword,
                    onValueChange = viewModel::onNewPasswordChange,
                    title = stringResource(R.string.change_password_new_label),
                    icon = MeeshyIcons.Lock,
                    isSecure = true,
                    contentType = AuthContentType.NewPassword,
                    enabled = !state.isSaving,
                )

                PasswordStrengthIndicator(password = state.newPassword)

                AuthTextField(
                    value = state.confirmPassword,
                    onValueChange = viewModel::onConfirmPasswordChange,
                    title = stringResource(R.string.change_password_confirm_label),
                    icon = MeeshyIcons.Lock,
                    isSecure = true,
                    contentType = AuthContentType.NewPassword,
                    imeAction = ImeAction.Done,
                    onImeAction = { if (state.canSubmit) viewModel.submit() },
                    enabled = !state.isSaving,
                )

                ValidationHints(state = state)

                state.error?.let { error ->
                    Text(
                        text = stringResource(error.messageRes()),
                        style = MaterialTheme.typography.bodySmall,
                        color = MeeshyPalette.Error,
                        textAlign = TextAlign.Center,
                        modifier = Modifier.fillMaxWidth(),
                    )
                }

                Button(
                    onClick = viewModel::submit,
                    enabled = state.canSubmit,
                    modifier = Modifier.fillMaxWidth(),
                    colors = ButtonDefaults.buttonColors(containerColor = MeeshyPalette.Indigo500),
                ) {
                    if (state.isSaving) {
                        CircularProgressIndicator(
                            modifier = Modifier.size(18.dp),
                            color = MeeshyPalette.White,
                            strokeWidth = 2.dp,
                        )
                        Spacer(Modifier.size(MeeshySpacing.sm))
                    }
                    Text(stringResource(R.string.change_password_submit))
                }

                Spacer(Modifier.height(MeeshySpacing.xl))
            }
        }
    }
}

@Composable
private fun ValidationHints(state: ChangePasswordUiState) {
    val validation = state.validation
    Column(verticalArrangement = Arrangement.spacedBy(MeeshySpacing.xs)) {
        HintRow(
            text = stringResource(R.string.change_password_hint_length),
            met = validation.isNewLongEnough,
        )
        HintRow(
            text = stringResource(R.string.change_password_hint_match),
            met = validation.passwordsMatch,
        )
        // Only surface the "must differ" hint once a new password is actually being typed.
        if (state.asksCurrentPassword && state.newPassword.isNotEmpty()) {
            HintRow(
                text = stringResource(R.string.change_password_hint_different),
                met = validation.isNewDifferent,
            )
        }
    }
}

@Composable
private fun HintRow(text: String, met: Boolean) {
    val color = if (met) MeeshyPalette.Success else MeeshyTheme.tokens.textMuted
    Row(
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.sm),
    ) {
        Icon(
            imageVector = if (met) Icons.Filled.CheckCircle else Icons.Filled.RadioButtonUnchecked,
            contentDescription = null,
            tint = color,
            modifier = Modifier.size(16.dp),
        )
        Text(text = text, style = MaterialTheme.typography.bodySmall, color = color)
    }
}

private fun ChangePasswordError.messageRes(): Int = when (this) {
    ChangePasswordError.INCORRECT_CURRENT -> R.string.change_password_error_current
    ChangePasswordError.NETWORK -> R.string.change_password_error_network
    ChangePasswordError.GENERIC -> R.string.change_password_error_generic
}
