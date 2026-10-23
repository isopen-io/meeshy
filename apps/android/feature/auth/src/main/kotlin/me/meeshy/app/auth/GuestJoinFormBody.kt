package me.meeshy.app.auth

import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.PressInteraction
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.DatePicker
import androidx.compose.material3.DatePickerDialog
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ExposedDropdownMenuBox
import androidx.compose.material3.ExposedDropdownMenuDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.SelectableDates
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TextFieldColors
import androidx.compose.material3.rememberDatePickerState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.compose.ui.text.input.KeyboardType
import me.meeshy.feature.auth.R
import me.meeshy.sdk.model.GuestJoinError
import me.meeshy.sdk.model.GuestJoinForm
import me.meeshy.sdk.model.GuestJoinLanguages
import me.meeshy.ui.component.MeeshyPrimaryButton
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme
import java.time.Instant
import java.time.ZoneOffset

@Composable
internal fun guestJoinErrorText(error: GuestJoinError): String = when (error) {
    GuestJoinError.LinkNotFound -> stringResource(R.string.guest_join_error_link_not_found)
    GuestJoinError.TooManyUsers -> stringResource(R.string.guest_join_error_too_many_users)
    GuestJoinError.SignInRequired -> stringResource(R.string.guest_join_error_sign_in)
    GuestJoinError.ConnectionFailed -> stringResource(R.string.guest_join_error_join_failed)
    is GuestJoinError.ServerMessage -> error.text
}

@Composable
private fun focusColors(): TextFieldColors = OutlinedTextFieldDefaults.colors(
    focusedBorderColor = MeeshyPalette.Indigo500,
    focusedLabelColor = MeeshyPalette.Indigo500,
    cursorColor = MeeshyPalette.Indigo500,
)

@Composable
private fun SectionTitle(text: String) {
    Text(
        text = text,
        style = MaterialTheme.typography.labelLarge,
        fontWeight = FontWeight.SemiBold,
        color = MeeshyTheme.tokens.textSecondary,
        modifier = Modifier.padding(top = MeeshySpacing.xs),
    )
}

@Composable
private fun GuestTextField(
    value: String,
    onValueChange: (String) -> Unit,
    label: String,
    enabled: Boolean,
    keyboardType: KeyboardType = KeyboardType.Text,
    capitalization: KeyboardCapitalization = KeyboardCapitalization.None,
    isError: Boolean = false,
    supportingText: String? = null,
) {
    OutlinedTextField(
        value = value,
        onValueChange = onValueChange,
        label = { Text(label) },
        singleLine = true,
        enabled = enabled,
        isError = isError,
        supportingText = supportingText?.let { { Text(it) } },
        colors = focusColors(),
        keyboardOptions = KeyboardOptions(keyboardType = keyboardType, capitalization = capitalization),
        modifier = Modifier.fillMaxWidth(),
    )
}

@Composable
internal fun GuestJoinFormBody(state: GuestJoinUiState, viewModel: GuestJoinViewModel) {
    val form = state.form
    val enabled = !state.isSubmitting

    Text(
        text = stringResource(R.string.guest_join_subtitle),
        style = MaterialTheme.typography.bodyMedium,
        color = MeeshyTheme.tokens.textSecondary,
    )

    SectionTitle(stringResource(R.string.guest_join_required_section))
    GuestTextField(
        form.firstName, viewModel::onFirstNameChange, stringResource(R.string.guest_join_first_name), enabled,
        capitalization = KeyboardCapitalization.Words,
    )
    GuestTextField(
        form.lastName, viewModel::onLastNameChange, stringResource(R.string.guest_join_last_name), enabled,
        capitalization = KeyboardCapitalization.Words,
    )
    if (form.requireNickname) {
        GuestTextField(form.username, viewModel::onUsernameChange, stringResource(R.string.guest_join_username), enabled)
    }
    if (form.requireEmail) {
        EmailField(form, viewModel, stringResource(R.string.guest_join_email), enabled)
    }
    if (form.requireBirthday) {
        BirthdayField(form.birthday, viewModel::onBirthdayChange, enabled)
    }

    if (!form.requireNickname || !form.requireEmail) {
        SectionTitle(stringResource(R.string.guest_join_optional_section))
        if (!form.requireNickname) {
            GuestTextField(
                form.username, viewModel::onUsernameChange, stringResource(R.string.guest_join_username_optional), enabled,
            )
        }
        if (!form.requireEmail) {
            EmailField(form, viewModel, stringResource(R.string.guest_join_email_optional), enabled)
        }
    }
    LanguageDropdown(form.language, viewModel::onLanguageChange, enabled)

    state.submitError?.let { error ->
        Text(
            text = guestJoinErrorText(error),
            style = MaterialTheme.typography.bodySmall,
            color = MeeshyPalette.Error,
            fontWeight = FontWeight.Medium,
        )
    }

    MeeshyPrimaryButton(
        text = stringResource(if (state.isSubmitting) R.string.guest_join_joining else R.string.guest_join_submit),
        onClick = viewModel::submit,
        enabled = state.canSubmit,
        loading = state.isSubmitting,
        modifier = Modifier.fillMaxWidth().padding(top = MeeshySpacing.sm),
    )
}

@Composable
private fun EmailField(form: GuestJoinForm, viewModel: GuestJoinViewModel, label: String, enabled: Boolean) {
    val showError = form.requireEmail && form.email.isNotBlank() && !form.isEmailValid
    GuestTextField(
        value = form.email,
        onValueChange = viewModel::onEmailChange,
        label = label,
        enabled = enabled,
        keyboardType = KeyboardType.Email,
        isError = showError,
        supportingText = if (showError) stringResource(R.string.guest_join_email_invalid) else null,
    )
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun LanguageDropdown(language: String, onChange: (String) -> Unit, enabled: Boolean) {
    var expanded by remember { mutableStateOf(false) }
    ExposedDropdownMenuBox(
        expanded = expanded,
        onExpandedChange = { if (enabled) expanded = it },
    ) {
        OutlinedTextField(
            value = GuestJoinLanguages.endonym(language),
            onValueChange = {},
            readOnly = true,
            enabled = enabled,
            singleLine = true,
            label = { Text(stringResource(R.string.guest_join_language)) },
            trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(expanded = expanded) },
            colors = focusColors(),
            modifier = Modifier.menuAnchor().fillMaxWidth(),
        )
        ExposedDropdownMenu(expanded = expanded, onDismissRequest = { expanded = false }) {
            GuestJoinLanguages.codes.forEach { code ->
                DropdownMenuItem(
                    text = { Text(GuestJoinLanguages.endonym(code)) },
                    onClick = {
                        onChange(code)
                        expanded = false
                    },
                )
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun BirthdayField(birthday: String, onChange: (String) -> Unit, enabled: Boolean) {
    var open by remember { mutableStateOf(false) }
    val source = remember { MutableInteractionSource() }
    LaunchedEffect(source, enabled) {
        source.interactions.collect { if (enabled && it is PressInteraction.Release) open = true }
    }
    OutlinedTextField(
        value = birthday,
        onValueChange = {},
        readOnly = true,
        enabled = enabled,
        singleLine = true,
        label = { Text(stringResource(R.string.guest_join_birthday)) },
        interactionSource = source,
        colors = focusColors(),
        modifier = Modifier.fillMaxWidth(),
    )
    if (open) {
        val now = System.currentTimeMillis()
        val pastOnly = remember {
            object : SelectableDates {
                override fun isSelectableDate(utcTimeMillis: Long): Boolean = utcTimeMillis < now
                override fun isSelectableYear(year: Int): Boolean = year <= java.time.Year.now().value
            }
        }
        val pickerState = rememberDatePickerState(selectableDates = pastOnly)
        DatePickerDialog(
            onDismissRequest = { open = false },
            confirmButton = {
                TextButton(
                    onClick = {
                        pickerState.selectedDateMillis?.let { millis ->
                            onChange(Instant.ofEpochMilli(millis).atZone(ZoneOffset.UTC).toLocalDate().toString())
                        }
                        open = false
                    },
                ) { Text(stringResource(android.R.string.ok)) }
            },
            dismissButton = {
                TextButton(onClick = { open = false }) { Text(stringResource(android.R.string.cancel)) }
            },
        ) { DatePicker(state = pickerState) }
    }
}
