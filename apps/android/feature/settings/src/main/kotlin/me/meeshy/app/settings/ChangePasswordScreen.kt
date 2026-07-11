package me.meeshy.app.settings

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.RadioButtonUnchecked
import androidx.compose.material.icons.filled.Visibility
import androidx.compose.material.icons.filled.VisibilityOff
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.compose.foundation.text.KeyboardOptions
import me.meeshy.feature.settings.R
import me.meeshy.sdk.model.ChangePasswordValidation
import me.meeshy.sdk.model.PasswordStrength
import me.meeshy.sdk.model.PasswordStrengthLevel
import me.meeshy.ui.component.chrome.MeeshyBackground
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshyRadius
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme

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
        Scaffold(
            containerColor = Color.Transparent,
            topBar = {
                TopAppBar(
                    colors = TopAppBarDefaults.topAppBarColors(
                        containerColor = Color.Transparent,
                        scrolledContainerColor = Color.Transparent,
                        titleContentColor = MeeshyTheme.tokens.textPrimary,
                        navigationIconContentColor = MeeshyTheme.tokens.textPrimary,
                    ),
                    title = { Text(stringResource(R.string.change_password_title)) },
                    navigationIcon = {
                        IconButton(onClick = onBack) {
                            Icon(
                                Icons.AutoMirrored.Filled.ArrowBack,
                                contentDescription = stringResource(R.string.settings_back),
                            )
                        }
                    },
                )
            },
        ) { padding ->
            Column(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(padding)
                    .verticalScroll(rememberScrollState())
                    .padding(horizontal = MeeshySpacing.lg, vertical = MeeshySpacing.md),
                verticalArrangement = Arrangement.spacedBy(MeeshySpacing.lg),
            ) {
                PasswordField(
                    label = stringResource(R.string.change_password_current_label),
                    value = state.currentPassword,
                    onValueChange = viewModel::onCurrentPasswordChange,
                )

                PasswordField(
                    label = stringResource(R.string.change_password_new_label),
                    value = state.newPassword,
                    onValueChange = viewModel::onNewPasswordChange,
                )

                if (state.newPassword.isNotEmpty()) {
                    StrengthMeter(level = state.strength)
                }

                PasswordField(
                    label = stringResource(R.string.change_password_confirm_label),
                    value = state.confirmPassword,
                    onValueChange = viewModel::onConfirmPasswordChange,
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

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun PasswordField(
    label: String,
    value: String,
    onValueChange: (String) -> Unit,
) {
    var visible by remember { mutableStateOf(false) }
    OutlinedTextField(
        value = value,
        onValueChange = onValueChange,
        label = { Text(label) },
        singleLine = true,
        visualTransformation = if (visible) VisualTransformation.None else PasswordVisualTransformation(),
        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password),
        trailingIcon = {
            IconButton(onClick = { visible = !visible }) {
                Icon(
                    imageVector = if (visible) Icons.Filled.VisibilityOff else Icons.Filled.Visibility,
                    contentDescription = stringResource(
                        if (visible) R.string.change_password_hide else R.string.change_password_show,
                    ),
                    tint = MeeshyTheme.tokens.textSecondary,
                )
            }
        },
        modifier = Modifier.fillMaxWidth(),
    )
}

@Composable
private fun StrengthMeter(level: PasswordStrengthLevel) {
    val color = level.barColor()
    Column(verticalArrangement = Arrangement.spacedBy(MeeshySpacing.xs)) {
        Row(horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.xs)) {
            repeat(PasswordStrength.MAX_SCORE) { index ->
                Box(
                    modifier = Modifier
                        .weight(1f)
                        .height(4.dp)
                        .clip(RoundedCornerShape(2.dp))
                        .background(if (index < level.score) color else MeeshyTheme.tokens.inputBorder),
                )
            }
        }
        Text(
            text = stringResource(level.labelRes()),
            style = MaterialTheme.typography.labelSmall,
            color = color,
        )
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
        if (state.newPassword.isNotEmpty()) {
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

private fun PasswordStrengthLevel.barColor(): Color = when (this) {
    PasswordStrengthLevel.TOO_WEAK, PasswordStrengthLevel.WEAK -> MeeshyPalette.Error
    PasswordStrengthLevel.MEDIUM, PasswordStrengthLevel.GOOD -> MeeshyPalette.Warning
    PasswordStrengthLevel.STRONG, PasswordStrengthLevel.EXCELLENT -> MeeshyPalette.Success
}

private fun PasswordStrengthLevel.labelRes(): Int = when (this) {
    PasswordStrengthLevel.TOO_WEAK -> R.string.change_password_strength_0
    PasswordStrengthLevel.WEAK -> R.string.change_password_strength_1
    PasswordStrengthLevel.MEDIUM -> R.string.change_password_strength_2
    PasswordStrengthLevel.GOOD -> R.string.change_password_strength_3
    PasswordStrengthLevel.STRONG -> R.string.change_password_strength_4
    PasswordStrengthLevel.EXCELLENT -> R.string.change_password_strength_5
}

private fun ChangePasswordError.messageRes(): Int = when (this) {
    ChangePasswordError.INCORRECT_CURRENT -> R.string.change_password_error_current
    ChangePasswordError.NETWORK -> R.string.change_password_error_network
    ChangePasswordError.GENERIC -> R.string.change_password_error_generic
}
