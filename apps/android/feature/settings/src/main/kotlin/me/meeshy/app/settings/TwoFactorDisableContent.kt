package me.meeshy.app.settings

import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import me.meeshy.feature.settings.R
import me.meeshy.ui.haptics.MeeshyHaptics
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme

@Composable
internal fun DisableContent(state: TwoFactorUiState, viewModel: TwoFactorViewModel, haptics: MeeshyHaptics) {
    Text(
        text = stringResource(R.string.twofactor_disable_title),
        style = MaterialTheme.typography.titleMedium,
        fontWeight = FontWeight.Bold,
        color = MeeshyTheme.tokens.textPrimary,
    )

    Text(
        text = stringResource(R.string.twofactor_disable_warning),
        style = MaterialTheme.typography.bodyMedium,
        color = MeeshyTheme.tokens.textSecondary,
    )

    OutlinedTextField(
        value = state.disablePassword,
        onValueChange = viewModel::onDisablePasswordChange,
        label = { Text(stringResource(R.string.twofactor_disable_password_label)) },
        singleLine = true,
        visualTransformation = PasswordVisualTransformation(),
        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password),
        modifier = Modifier.fillMaxWidth(),
    )
    OutlinedTextField(
        value = state.disableCode,
        onValueChange = viewModel::onDisableCodeChange,
        label = { Text(stringResource(R.string.twofactor_disable_code_label)) },
        singleLine = true,
        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.NumberPassword),
        modifier = Modifier.fillMaxWidth(),
    )

    ErrorText(state.error)

    Button(
        onClick = {
            haptics.medium()
            viewModel.confirmDisable()
        },
        enabled = state.canConfirmDisable,
        modifier = Modifier.fillMaxWidth(),
        colors = ButtonDefaults.buttonColors(containerColor = MeeshyPalette.Error),
    ) {
        if (state.isSubmitting) {
            CircularProgressIndicator(modifier = Modifier.size(18.dp), color = MeeshyPalette.White, strokeWidth = 2.dp)
            Spacer(Modifier.size(MeeshySpacing.sm))
        }
        Text(stringResource(R.string.twofactor_disable_confirm))
    }
}

@Composable
internal fun RegenerateContent(state: TwoFactorUiState, viewModel: TwoFactorViewModel, haptics: MeeshyHaptics) {
    Text(
        text = stringResource(R.string.twofactor_regenerate_title),
        style = MaterialTheme.typography.titleMedium,
        fontWeight = FontWeight.Bold,
        color = MeeshyTheme.tokens.textPrimary,
    )

    Text(
        text = stringResource(R.string.twofactor_regenerate_warning),
        style = MaterialTheme.typography.bodyMedium,
        color = MeeshyPalette.Warning,
    )

    OutlinedTextField(
        value = state.codeInput,
        onValueChange = viewModel::onCodeChange,
        label = { Text(stringResource(R.string.twofactor_regenerate_code_label)) },
        singleLine = true,
        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.NumberPassword),
        modifier = Modifier.fillMaxWidth(),
    )

    ErrorText(state.error)

    Button(
        onClick = {
            haptics.medium()
            viewModel.confirmRegenerateCodes()
        },
        enabled = state.canConfirmCode,
        modifier = Modifier.fillMaxWidth(),
        colors = ButtonDefaults.buttonColors(containerColor = MeeshyPalette.Indigo500),
    ) {
        if (state.isSubmitting) {
            CircularProgressIndicator(modifier = Modifier.size(18.dp), color = MeeshyPalette.White, strokeWidth = 2.dp)
            Spacer(Modifier.size(MeeshySpacing.sm))
        }
        Text(stringResource(R.string.twofactor_regenerate_confirm))
    }
}

@Composable
internal fun ErrorText(error: TwoFactorErrorKind?) {
    val messageRes = error?.messageRes() ?: return
    Text(
        text = stringResource(messageRes),
        style = MaterialTheme.typography.bodySmall,
        color = MeeshyPalette.Error,
        textAlign = TextAlign.Center,
        modifier = Modifier.fillMaxWidth(),
    )
}

private fun TwoFactorErrorKind.messageRes(): Int = when (this) {
    TwoFactorErrorKind.STATUS -> R.string.twofactor_error_status
    TwoFactorErrorKind.SETUP -> R.string.twofactor_error_setup
    TwoFactorErrorKind.INVALID_CODE -> R.string.twofactor_error_invalid_code
    TwoFactorErrorKind.DISABLE -> R.string.twofactor_error_disable
    TwoFactorErrorKind.BACKUP_CODES -> R.string.twofactor_error_backup_codes
}
