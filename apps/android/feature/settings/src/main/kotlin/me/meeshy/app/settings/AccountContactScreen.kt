package me.meeshy.app.settings

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Email
import androidx.compose.material.icons.filled.Phone
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
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import me.meeshy.feature.settings.R
import me.meeshy.ui.component.chrome.MeeshyBackground
import me.meeshy.ui.component.chrome.MeeshyGlassSurface
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshyRadius
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme

/**
 * "Change email / phone" settings screen (feature-parity §K) — port of iOS
 * `SecurityView`'s email/phone sections. Two independent sub-flows share this screen:
 * email confirms out-of-band (a link mailed to the new address — this screen never
 * collects a token, exactly like iOS); phone confirms in-app via a 6-digit SMS code.
 * Pure glue over [AccountContactViewModel]; every decision (format gating, submit
 * gating, error mapping) lives in the tested view model.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun AccountContactScreen(
    onBack: () -> Unit,
    viewModel: AccountContactViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsStateWithLifecycle()

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
                    title = { Text(stringResource(R.string.account_contact_title)) },
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
                verticalArrangement = Arrangement.spacedBy(MeeshySpacing.xl),
            ) {
                EmailSection(state, viewModel)
                PhoneSection(state, viewModel)
                Spacer(Modifier.height(MeeshySpacing.xl))
            }
        }
    }
}

@Composable
private fun EmailSection(state: AccountContactUiState, viewModel: AccountContactViewModel) {
    Column(verticalArrangement = Arrangement.spacedBy(MeeshySpacing.sm)) {
        SectionTitle(stringResource(R.string.account_contact_email_section))

        MeeshyGlassSurface(shape = RoundedCornerShape(MeeshyRadius.lg), modifier = Modifier.fillMaxWidth()) {
            Column(modifier = Modifier.padding(MeeshySpacing.lg)) {
                CurrentValueRow(
                    icon = Icons.Filled.Email,
                    label = stringResource(R.string.account_contact_email_current_label),
                    value = state.user?.email,
                    verified = state.user?.emailVerifiedAt != null,
                )

                when {
                    state.isEditingEmail -> EditRow(
                        value = state.newEmail,
                        onValueChange = viewModel::onNewEmailChange,
                        label = stringResource(R.string.account_contact_email_new_label),
                        keyboardType = KeyboardType.Email,
                        canSubmit = state.canSubmitEmail,
                        isSubmitting = state.emailLoading,
                        onCancel = viewModel::cancelEditEmail,
                        onSubmit = viewModel::submitEmailChange,
                    )

                    state.emailSent -> SentRow(
                        sentLabel = stringResource(R.string.account_contact_email_sent),
                        resendLabel = if (state.canResendEmail) {
                            stringResource(R.string.account_contact_email_resend)
                        } else {
                            stringResource(
                                R.string.account_contact_email_resend_cooldown,
                                state.resendCooldown?.remaining ?: 0,
                            )
                        },
                        canResend = state.canResendEmail,
                        onResend = viewModel::resendEmailVerification,
                    )

                    else -> EditVerifyRow(
                        showVerify = !state.user?.email.isNullOrBlank() && state.user?.emailVerifiedAt == null,
                        onEdit = viewModel::beginEditEmail,
                        onVerify = viewModel::verifyCurrentEmail,
                    )
                }

                ErrorText(state.emailError?.messageRes())
            }
        }
    }
}

@Composable
private fun PhoneSection(state: AccountContactUiState, viewModel: AccountContactViewModel) {
    Column(verticalArrangement = Arrangement.spacedBy(MeeshySpacing.sm)) {
        SectionTitle(stringResource(R.string.account_contact_phone_section))

        MeeshyGlassSurface(shape = RoundedCornerShape(MeeshyRadius.lg), modifier = Modifier.fillMaxWidth()) {
            Column(modifier = Modifier.padding(MeeshySpacing.lg)) {
                CurrentValueRow(
                    icon = Icons.Filled.Phone,
                    label = stringResource(R.string.account_contact_phone_current_label),
                    value = state.user?.phoneNumber,
                    verified = state.user?.phoneVerifiedAt != null,
                )

                when {
                    state.phoneSent -> PhoneCodeRow(state, viewModel)

                    state.isEditingPhone -> EditRow(
                        value = state.newPhone,
                        onValueChange = viewModel::onNewPhoneChange,
                        label = stringResource(R.string.account_contact_phone_new_label),
                        keyboardType = KeyboardType.Phone,
                        canSubmit = state.canSubmitPhone,
                        isSubmitting = state.phoneLoading,
                        onCancel = viewModel::cancelEditPhone,
                        onSubmit = viewModel::submitPhoneChange,
                        submitLabel = stringResource(R.string.account_contact_phone_send_code),
                    )

                    else -> EditVerifyRow(
                        showVerify = !state.user?.phoneNumber.isNullOrBlank() && state.user?.phoneVerifiedAt == null,
                        onEdit = viewModel::beginEditPhone,
                        onVerify = viewModel::verifyCurrentPhone,
                    )
                }

                ErrorText(state.phoneError?.messageRes())
            }
        }
    }
}

@Composable
private fun PhoneCodeRow(state: AccountContactUiState, viewModel: AccountContactViewModel) {
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
            TextButton(onClick = viewModel::cancelPhoneVerification) {
                Text(stringResource(R.string.account_contact_cancel))
            }
            Button(
                onClick = viewModel::verifyPhoneCode,
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

@Composable
private fun CurrentValueRow(
    icon: androidx.compose.ui.graphics.vector.ImageVector,
    label: String,
    value: String?,
    verified: Boolean,
) {
    Row(verticalAlignment = Alignment.CenterVertically) {
        Icon(icon, contentDescription = null, tint = MeeshyPalette.Indigo500, modifier = Modifier.size(20.dp))
        Spacer(Modifier.size(MeeshySpacing.sm))
        Column(modifier = Modifier.weight(1f)) {
            Text(label, style = MaterialTheme.typography.labelSmall, color = MeeshyTheme.tokens.textMuted)
            Text(
                text = value?.takeIf { it.isNotBlank() } ?: stringResource(R.string.account_contact_not_set),
                style = MaterialTheme.typography.bodyMedium,
                fontWeight = FontWeight.Medium,
                color = if (value.isNullOrBlank()) MeeshyTheme.tokens.textMuted else MeeshyTheme.tokens.textPrimary,
            )
        }
        if (!value.isNullOrBlank()) {
            VerificationBadge(verified)
        }
    }
}

@Composable
private fun VerificationBadge(verified: Boolean) {
    val color = if (verified) MeeshyPalette.Success else MeeshyPalette.Warning
    val label = stringResource(
        if (verified) R.string.account_contact_verified else R.string.account_contact_not_verified,
    )
    Text(
        text = label,
        style = MaterialTheme.typography.labelSmall,
        fontWeight = FontWeight.Bold,
        color = MeeshyPalette.White,
        modifier = Modifier
            .clip(CircleShape)
            .background(color)
            .padding(horizontal = MeeshySpacing.sm, vertical = 2.dp),
    )
}

@Composable
private fun SectionTitle(text: String) {
    Text(
        text = text.uppercase(),
        style = MaterialTheme.typography.labelMedium,
        fontWeight = FontWeight.Bold,
        color = MeeshyPalette.Indigo500,
    )
}

@Composable
private fun EditVerifyRow(showVerify: Boolean, onEdit: () -> Unit, onVerify: () -> Unit) {
    Row(
        modifier = Modifier.padding(top = MeeshySpacing.sm),
        horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.sm),
    ) {
        TextButton(onClick = onEdit) {
            Text(stringResource(R.string.account_contact_edit))
        }
        if (showVerify) {
            TextButton(onClick = onVerify) {
                Text(stringResource(R.string.account_contact_verify), color = MeeshyPalette.Success)
            }
        }
    }
}

@Composable
private fun EditRow(
    value: String,
    onValueChange: (String) -> Unit,
    label: String,
    keyboardType: KeyboardType,
    canSubmit: Boolean,
    isSubmitting: Boolean,
    onCancel: () -> Unit,
    onSubmit: () -> Unit,
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
            singleLine = true,
            keyboardOptions = KeyboardOptions(keyboardType = keyboardType),
            modifier = Modifier.fillMaxWidth(),
        )
        Row(horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.sm)) {
            TextButton(onClick = onCancel) {
                Text(stringResource(R.string.account_contact_cancel))
            }
            Button(
                onClick = onSubmit,
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

@Composable
private fun SentRow(sentLabel: String, resendLabel: String, canResend: Boolean, onResend: () -> Unit) {
    Row(
        modifier = Modifier.padding(top = MeeshySpacing.md),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(sentLabel, style = MaterialTheme.typography.bodySmall, color = MeeshyPalette.Success, modifier = Modifier.weight(1f))
        TextButton(onClick = onResend, enabled = canResend) {
            Text(resendLabel)
        }
    }
}

@Composable
private fun ErrorText(messageRes: Int?) {
    val res = messageRes ?: return
    Text(
        text = stringResource(res),
        style = MaterialTheme.typography.bodySmall,
        color = MeeshyPalette.Error,
        modifier = Modifier.padding(top = MeeshySpacing.sm).fillMaxWidth(),
        textAlign = TextAlign.Center,
    )
}

private fun AccountContactErrorKind.messageRes(): Int = when (this) {
    AccountContactErrorKind.EMAIL_CHANGE -> R.string.account_contact_error_email_change
    AccountContactErrorKind.EMAIL_RESEND -> R.string.account_contact_error_email_resend
    AccountContactErrorKind.PHONE_CHANGE -> R.string.account_contact_error_phone_change
    AccountContactErrorKind.PHONE_VERIFY_INVALID -> R.string.account_contact_error_phone_verify_invalid
    AccountContactErrorKind.PHONE_VERIFY_GENERIC -> R.string.account_contact_error_phone_verify_generic
}
