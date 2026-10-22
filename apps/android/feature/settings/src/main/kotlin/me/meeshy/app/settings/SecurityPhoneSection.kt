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
import androidx.compose.material.icons.filled.Phone
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
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
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshySpacing

/** Section Téléphone : saisie, envoi du code SMS, code à 6 chiffres, vérification. */
@OptIn(ExperimentalComposeUiApi::class)
@Composable
internal fun SecurityPhoneSection(state: AccountContactUiState, viewModel: AccountContactViewModel) {
    val haptics = rememberMeeshyHaptics()
    SecuritySectionCard(Icons.Filled.Phone, stringResource(R.string.account_contact_phone_section)) {
        SecurityCurrentValueRow(
            icon = Icons.Filled.Phone,
            label = stringResource(R.string.account_contact_phone_current_label),
            value = state.user?.phoneNumber,
            badge = ContactVerificationBadge.of(state.user?.phoneNumber, state.user?.phoneVerifiedAt),
        )
        when {
            state.phoneSent -> PhoneCodeRow(state, viewModel, haptics)
            state.isEditingPhone -> SecurityEditRow(
                value = state.newPhone,
                onValueChange = viewModel::onNewPhoneChange,
                label = stringResource(R.string.account_contact_phone_new_label),
                keyboardType = KeyboardType.Phone,
                autofill = AutofillType.PhoneNumber,
                canSubmit = state.canSubmitPhone,
                isSubmitting = state.phoneLoading,
                haptics = haptics,
                onCancel = viewModel::cancelEditPhone,
                onSubmit = viewModel::submitPhoneChange,
                placeholder = stringResource(R.string.security_phone_placeholder),
                submitLabel = stringResource(R.string.account_contact_phone_send_code),
            )
            else -> SecurityEditVerifyRow(
                showVerify = !state.user?.phoneNumber.isNullOrBlank() && state.user?.phoneVerifiedAt == null,
                haptics = haptics,
                onEdit = viewModel::beginEditPhone,
                onVerify = viewModel::verifyCurrentPhone,
            )
        }
        SecurityErrorText(state.phoneError?.messageRes())
    }
}

@Composable
private fun PhoneCodeRow(state: AccountContactUiState, viewModel: AccountContactViewModel, haptics: MeeshyHaptics) {
    Column(
        modifier = Modifier.padding(top = MeeshySpacing.md),
        verticalArrangement = Arrangement.spacedBy(MeeshySpacing.sm),
    ) {
        Text(
            text = stringResource(R.string.account_contact_phone_code_sent),
            style = MaterialTheme.typography.bodySmall,
            color = MeeshyPalette.Success,
        )
        OutlinedTextField(
            value = state.phoneCode,
            onValueChange = viewModel::onPhoneCodeChange,
            label = { Text(stringResource(R.string.account_contact_phone_code_label)) },
            singleLine = true,
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.NumberPassword),
            modifier = Modifier.fillMaxWidth(),
        )
        Row(horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.sm)) {
            TextButton(onClick = { haptics.light(); viewModel.cancelPhoneVerification() }) {
                Text(stringResource(R.string.account_contact_cancel))
            }
            Button(
                onClick = { haptics.medium(); viewModel.verifyPhoneCode() },
                enabled = state.canVerifyPhoneCode,
                colors = ButtonDefaults.buttonColors(containerColor = MeeshyPalette.Indigo500),
            ) {
                if (state.phoneVerifying) {
                    CircularProgressIndicator(modifier = Modifier.size(16.dp), color = MeeshyPalette.White, strokeWidth = 2.dp)
                    Spacer(Modifier.size(MeeshySpacing.sm))
                }
                Text(stringResource(R.string.account_contact_phone_verify))
            }
        }
    }
}
