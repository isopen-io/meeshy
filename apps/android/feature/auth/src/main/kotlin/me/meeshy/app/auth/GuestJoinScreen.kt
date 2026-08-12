package me.meeshy.app.auth

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import me.meeshy.feature.auth.R
import me.meeshy.ui.component.MeeshyPrimaryButton
import me.meeshy.ui.component.chrome.MeeshyBackground
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme

private val GUEST_LANGUAGES = listOf(
    "fr" to "Français",
    "en" to "English",
    "es" to "Español",
    "pt" to "Português",
)

/**
 * The guest (shared-link) join screen: a public preview → temporary-identity form
 * → join. Reached via a `meeshy://join/{identifier}` deep link. Cache-cold, so a
 * spinner is shown only while the preview loads; a failed preview offers a retry,
 * and an account-required link steers the visitor to sign in instead — no dead end.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun GuestJoinScreen(
    onJoined: () -> Unit,
    onBack: () -> Unit,
    onSignIn: () -> Unit,
    viewModel: GuestJoinViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsStateWithLifecycle()

    LaunchedEffect(state.isJoined) {
        if (state.isJoined) onJoined()
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
                    title = {
                        Text(state.info?.name?.takeIf { it.isNotBlank() } ?: stringResource(R.string.guest_join_title))
                    },
                    navigationIcon = {
                        IconButton(onClick = onBack) {
                            Icon(
                                Icons.AutoMirrored.Filled.ArrowBack,
                                contentDescription = stringResource(R.string.guest_join_back),
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
                    .imePadding()
                    .verticalScroll(rememberScrollState())
                    .padding(horizontal = MeeshySpacing.lg, vertical = MeeshySpacing.md),
                verticalArrangement = Arrangement.spacedBy(MeeshySpacing.md),
            ) {
                when {
                    state.isLoadingPreview -> LoadingBody()
                    state.previewErrorMessage != null -> PreviewErrorBody(
                        message = state.previewErrorMessage!!,
                        onRetry = viewModel::loadPreview,
                    )
                    state.requiresAccount -> RequiresAccountBody(onSignIn = onSignIn)
                    else -> FormBody(state = state, viewModel = viewModel)
                }
            }
        }
    }
}

@Composable
private fun LoadingBody() {
    Column(
        modifier = Modifier.fillMaxWidth().padding(top = MeeshySpacing.xl),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        CircularProgressIndicator(color = MeeshyPalette.Indigo500)
    }
}

@Composable
private fun PreviewErrorBody(message: String, onRetry: () -> Unit) {
    Column(
        modifier = Modifier.fillMaxWidth().padding(top = MeeshySpacing.xl),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(MeeshySpacing.md),
    ) {
        Text(
            text = stringResource(R.string.guest_join_preview_error),
            style = MaterialTheme.typography.titleMedium,
            color = MeeshyTheme.tokens.textPrimary,
        )
        Text(text = message, style = MaterialTheme.typography.bodySmall, color = MeeshyTheme.tokens.textSecondary)
        OutlinedButton(onClick = onRetry) { Text(stringResource(R.string.guest_join_retry)) }
    }
}

@Composable
private fun RequiresAccountBody(onSignIn: () -> Unit) {
    Column(
        modifier = Modifier.fillMaxWidth().padding(top = MeeshySpacing.xl),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(MeeshySpacing.md),
    ) {
        Text(
            text = stringResource(R.string.guest_join_requires_account),
            style = MaterialTheme.typography.titleMedium,
            color = MeeshyTheme.tokens.textPrimary,
        )
        MeeshyPrimaryButton(
            text = stringResource(R.string.guest_join_sign_in),
            onClick = onSignIn,
            modifier = Modifier.fillMaxWidth(),
        )
    }
}

@Composable
private fun FormBody(state: GuestJoinUiState, viewModel: GuestJoinViewModel) {
    val form = state.form

    Text(
        text = stringResource(R.string.guest_join_subtitle),
        style = MaterialTheme.typography.bodyMedium,
        color = MeeshyTheme.tokens.textSecondary,
    )

    OutlinedTextField(
        value = form.firstName,
        onValueChange = viewModel::onFirstNameChange,
        label = { Text(stringResource(R.string.guest_join_first_name)) },
        singleLine = true,
        enabled = !state.isSubmitting,
        modifier = Modifier.fillMaxWidth(),
    )
    OutlinedTextField(
        value = form.lastName,
        onValueChange = viewModel::onLastNameChange,
        label = { Text(stringResource(R.string.guest_join_last_name)) },
        singleLine = true,
        enabled = !state.isSubmitting,
        modifier = Modifier.fillMaxWidth(),
    )
    OutlinedTextField(
        value = form.username,
        onValueChange = viewModel::onUsernameChange,
        label = {
            Text(
                stringResource(
                    if (form.requireNickname) R.string.guest_join_username else R.string.guest_join_username_optional,
                ),
            )
        },
        singleLine = true,
        enabled = !state.isSubmitting,
        modifier = Modifier.fillMaxWidth(),
    )
    if (form.requireEmail) {
        OutlinedTextField(
            value = form.email,
            onValueChange = viewModel::onEmailChange,
            label = { Text(stringResource(R.string.guest_join_email)) },
            singleLine = true,
            enabled = !state.isSubmitting,
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Email),
            modifier = Modifier.fillMaxWidth(),
        )
    }
    if (form.requireBirthday) {
        OutlinedTextField(
            value = form.birthday,
            onValueChange = viewModel::onBirthdayChange,
            label = { Text(stringResource(R.string.guest_join_birthday)) },
            singleLine = true,
            enabled = !state.isSubmitting,
            modifier = Modifier.fillMaxWidth(),
        )
    }

    Text(
        text = stringResource(R.string.guest_join_language),
        style = MaterialTheme.typography.labelLarge,
        color = MeeshyTheme.tokens.textSecondary,
        modifier = Modifier.padding(top = MeeshySpacing.xs),
    )
    Row(horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.sm)) {
        GUEST_LANGUAGES.forEach { (code, label) ->
            FilterChip(
                selected = form.language == code,
                onClick = { viewModel.onLanguageChange(code) },
                enabled = !state.isSubmitting,
                label = { Text(label) },
            )
        }
    }

    state.submitErrorMessage?.let { message ->
        Text(
            text = message,
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
