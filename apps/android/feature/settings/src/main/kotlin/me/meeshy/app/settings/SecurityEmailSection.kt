package me.meeshy.app.settings

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Email
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.ExperimentalComposeUiApi
import androidx.compose.ui.Modifier
import androidx.compose.ui.autofill.AutofillType
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import me.meeshy.feature.settings.R
import me.meeshy.sdk.model.account.ContactVerificationBadge
import me.meeshy.ui.haptics.MeeshyHaptics
import me.meeshy.ui.haptics.rememberMeeshyHaptics
import me.meeshy.ui.modifier.autofill
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshySpacing

/** Section E-mail : valeur + badge, Modifier, lien de vérification, renvoi après 60 s. */
@OptIn(ExperimentalComposeUiApi::class)
@Composable
internal fun SecurityEmailSection(state: AccountContactUiState, viewModel: AccountContactViewModel) {
    val haptics = rememberMeeshyHaptics()
    SecuritySectionCard(Icons.Filled.Email, stringResource(R.string.account_contact_email_section)) {
        SecurityCurrentValueRow(
            icon = Icons.Filled.Email,
            label = stringResource(R.string.account_contact_email_current_label),
            value = state.user?.email,
            badge = ContactVerificationBadge.of(state.user?.email, state.user?.emailVerifiedAt),
        )
        when {
            state.isEditingEmail -> SecurityEditRow(
                value = state.newEmail,
                onValueChange = viewModel::onNewEmailChange,
                label = stringResource(R.string.account_contact_email_new_label),
                keyboardType = KeyboardType.Email,
                autofill = AutofillType.EmailAddress,
                canSubmit = state.canSubmitEmail,
                isSubmitting = state.emailLoading,
                haptics = haptics,
                onCancel = viewModel::cancelEditEmail,
                onSubmit = viewModel::submitEmailChange,
            )
            state.emailSent -> Row(
                modifier = Modifier.padding(top = MeeshySpacing.md),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text(
                    stringResource(R.string.account_contact_email_sent),
                    style = MaterialTheme.typography.bodySmall,
                    color = MeeshyPalette.Success,
                    modifier = Modifier.weight(1f),
                )
                TextButton(
                    onClick = {
                        haptics.light()
                        viewModel.resendEmailVerification()
                    },
                    enabled = state.canResendEmail,
                ) {
                    Text(
                        if (state.canResendEmail) {
                            stringResource(R.string.account_contact_email_resend)
                        } else {
                            stringResource(R.string.account_contact_email_resend_cooldown, state.resendCooldown?.remaining ?: 0)
                        },
                    )
                }
            }
            else -> SecurityEditVerifyRow(
                showVerify = !state.user?.email.isNullOrBlank() && state.user?.emailVerifiedAt == null,
                haptics = haptics,
                onEdit = viewModel::beginEditEmail,
                onVerify = viewModel::verifyCurrentEmail,
            )
        }
        SecurityErrorText(state.emailError?.messageRes())
    }
}

@Composable
internal fun SecurityEditVerifyRow(
    showVerify: Boolean,
    haptics: MeeshyHaptics,
    onEdit: () -> Unit,
    onVerify: () -> Unit,
) {
    Row(
        modifier = Modifier.padding(top = MeeshySpacing.sm),
        horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.sm),
    ) {
        TextButton(onClick = { haptics.light(); onEdit() }) {
            Text(stringResource(R.string.account_contact_edit))
        }
        if (showVerify) {
            TextButton(onClick = { haptics.medium(); onVerify() }) {
                Text(stringResource(R.string.account_contact_verify), color = MeeshyPalette.Success)
            }
        }
    }
}

@OptIn(ExperimentalComposeUiApi::class)
@Composable
internal fun SecurityEditRow(
    value: String,
    onValueChange: (String) -> Unit,
    label: String,
    keyboardType: KeyboardType,
    autofill: AutofillType,
    canSubmit: Boolean,
    isSubmitting: Boolean,
    haptics: MeeshyHaptics,
    onCancel: () -> Unit,
    onSubmit: () -> Unit,
    placeholder: String? = null,
    submitLabel: String? = null,
) {
    Column(
        modifier = Modifier.padding(top = MeeshySpacing.md),
        verticalArrangement = Arrangement.spacedBy(MeeshySpacing.sm),
    ) {
        OutlinedTextField(
            value = value,
            onValueChange = onValueChange,
            label = { Text(label) },
            placeholder = placeholder?.let { { Text(it) } },
            singleLine = true,
            keyboardOptions = KeyboardOptions(keyboardType = keyboardType),
            modifier = Modifier.fillMaxWidth().autofill(listOf(autofill), onValueChange),
        )
        Row(horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.sm)) {
            TextButton(onClick = { haptics.light(); onCancel() }) {
                Text(stringResource(R.string.account_contact_cancel))
            }
            Button(
                onClick = { haptics.medium(); onSubmit() },
                enabled = canSubmit,
                colors = ButtonDefaults.buttonColors(containerColor = MeeshyPalette.Indigo500),
            ) {
                if (isSubmitting) {
                    CircularProgressIndicator(modifier = Modifier.size(16.dp), color = MeeshyPalette.White, strokeWidth = 2.dp)
                    Spacer(Modifier.size(MeeshySpacing.sm))
                }
                Text(submitLabel ?: stringResource(R.string.account_contact_send))
            }
        }
    }
}

internal fun AccountContactErrorKind.messageRes(): Int = when (this) {
    AccountContactErrorKind.EMAIL_CHANGE -> R.string.account_contact_error_email_change
    AccountContactErrorKind.EMAIL_RESEND -> R.string.account_contact_error_email_resend
    AccountContactErrorKind.PHONE_CHANGE -> R.string.account_contact_error_phone_change
    AccountContactErrorKind.PHONE_VERIFY_INVALID -> R.string.account_contact_error_phone_verify_invalid
    AccountContactErrorKind.PHONE_VERIFY_GENERIC -> R.string.account_contact_error_phone_verify_generic
}
