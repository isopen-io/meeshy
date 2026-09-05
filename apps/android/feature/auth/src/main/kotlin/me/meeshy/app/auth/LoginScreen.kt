package me.meeshy.app.auth

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.systemBarsPadding
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.automirrored.filled.KeyboardArrowRight
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.Close
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import me.meeshy.feature.auth.R
import me.meeshy.sdk.model.auth.SavedAccount
import me.meeshy.sdk.model.auth.ServerEnvironment
import me.meeshy.ui.component.BrandLogo
import me.meeshy.ui.component.MeeshyAvatar
import me.meeshy.ui.component.MeeshyPrimaryButton
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme

@Composable
fun LoginScreen(
    viewModel: AuthViewModel,
    onAuthenticated: () -> Unit,
    onSignUp: () -> Unit = {},
    onForgotPassword: () -> Unit = {},
    onMagicLink: () -> Unit = {},
) {
    val state by viewModel.state.collectAsStateWithLifecycle()

    LaunchedEffect(state.isAuthenticated) {
        if (state.isAuthenticated) onAuthenticated()
    }

    Surface(modifier = Modifier.fillMaxSize(), color = MeeshyTheme.tokens.backgroundPrimary) {
        Column(
            modifier = Modifier
                .fillMaxSize()
                // Cet ecran n'a pas de Scaffold : depuis que le Scaffold racine ne
                // reserve plus les barres systeme (MeeshyApp.kt, contentWindowInsets
                // a zero), il pose lui-meme son inset. Le fond reste PLEIN ECRAN,
                // seul le CONTENU est retreci — c'est exactement la geometrie
                // d'avant, le degrade en plus.
                .systemBarsPadding()
                .imePadding()
                .padding(horizontal = MeeshySpacing.xl),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.Center,
        ) {
            BrandLogo()

            Text(
                text = stringResource(R.string.login_welcome_back),
                style = MaterialTheme.typography.headlineSmall,
                fontWeight = FontWeight.SemiBold,
                color = MeeshyTheme.tokens.textPrimary,
                modifier = Modifier.padding(top = MeeshySpacing.xl),
            )

            // Parity iOS LoginView: showPicker gates the remembered-account picker
            // (list, or the selected account's password prompt) vs. the plain
            // username/password form — see AuthUiState.showPicker.
            if (state.showPicker) {
                val selected = state.selectedAccount
                if (selected != null) {
                    SelectedAccountForm(
                        account = selected,
                        state = state,
                        viewModel = viewModel,
                        modifier = Modifier.fillMaxWidth().padding(top = MeeshySpacing.xl),
                    )
                } else {
                    SavedAccountsPicker(
                        accounts = state.savedAccounts,
                        errorText = state.errorMessage,
                        onAccountTap = viewModel::selectAccount,
                        onAccountRemove = viewModel::removeAccount,
                        onOtherAccount = viewModel::useAnotherAccount,
                        modifier = Modifier.fillMaxWidth().padding(top = MeeshySpacing.xl),
                    )
                }
            } else {
                NormalLoginForm(
                    state = state,
                    viewModel = viewModel,
                    showBackToPicker = state.showNormalLogin && state.savedAccounts.isNotEmpty(),
                )
            }

            // Recuperation de compte : les deux chemins sans mot de passe,
            // juste sous le formulaire (parite iOS LoginView).
            Row(
                verticalAlignment = Alignment.CenterVertically,
                modifier = Modifier.padding(top = MeeshySpacing.sm),
            ) {
                TextButton(onClick = onForgotPassword, enabled = !state.isSubmitting) {
                    Text(
                        text = stringResource(R.string.login_forgot_password),
                        style = MaterialTheme.typography.bodySmall,
                    )
                }
                TextButton(onClick = onMagicLink, enabled = !state.isSubmitting) {
                    Text(
                        text = stringResource(R.string.login_magic_link),
                        style = MaterialTheme.typography.bodySmall,
                    )
                }
            }

            Row(
                verticalAlignment = Alignment.CenterVertically,
                modifier = Modifier.padding(top = MeeshySpacing.md),
            ) {
                Text(
                    text = stringResource(R.string.login_signup_prompt),
                    style = MaterialTheme.typography.bodySmall,
                    color = MeeshyTheme.tokens.textSecondary,
                )
                TextButton(onClick = onSignUp, enabled = !state.isSubmitting) {
                    Text(
                        text = stringResource(R.string.login_signup_link),
                        style = MaterialTheme.typography.bodySmall,
                        fontWeight = FontWeight.SemiBold,
                    )
                }
            }

            // Parity iOS LoginView.environmentSelector — developer/QA-only backend
            // picker. iOS gates on `Self.isSimulator`; Android gates on
            // `showEnvironmentSelector` (== BuildConfig.DEBUG via MeeshyConfig), the
            // idiomatic Android equivalent (no reliable simulator-vs-device signal).
            if (state.showEnvironmentSelector) {
                EnvironmentSelector(
                    state = state,
                    viewModel = viewModel,
                    modifier = Modifier.fillMaxWidth().padding(top = MeeshySpacing.md),
                )
            }
        }
    }
}

/** Developer/QA backend picker — iOS `LoginView.environmentSelector`. */
@Composable
private fun EnvironmentSelector(
    state: AuthUiState,
    viewModel: AuthViewModel,
    modifier: Modifier = Modifier,
) {
    Column(modifier = modifier, horizontalAlignment = Alignment.CenterHorizontally) {
        Row(horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.sm)) {
            ServerEnvironment.entries.forEach { env ->
                FilterChip(
                    selected = state.selectedEnvironment == env,
                    onClick = { viewModel.selectEnvironment(env) },
                    label = { Text(env.label) },
                )
            }
        }

        if (state.showCustomHostInput) {
            Row(
                verticalAlignment = Alignment.CenterVertically,
                modifier = Modifier.fillMaxWidth().padding(top = MeeshySpacing.sm),
            ) {
                OutlinedTextField(
                    value = state.customHostInput,
                    onValueChange = viewModel::onCustomHostChange,
                    label = { Text(stringResource(R.string.login_custom_host_label)) },
                    singleLine = true,
                    modifier = Modifier.weight(1f),
                )
                IconButton(onClick = viewModel::applyCustomHost, enabled = state.canApplyCustomHost) {
                    Icon(
                        imageVector = Icons.Filled.Check,
                        contentDescription = stringResource(R.string.login_apply_custom_host),
                    )
                }
            }
        }

        Text(
            text = stringResource(R.string.login_server_origin, state.serverOriginLabel),
            style = MaterialTheme.typography.labelSmall,
            color = MeeshyTheme.tokens.textMuted,
            modifier = Modifier.padding(top = MeeshySpacing.xs),
        )
    }
}

/** The remembered-account list — iOS `LoginView.savedAccountsList`. */
@Composable
private fun SavedAccountsPicker(
    accounts: List<SavedAccount>,
    errorText: String?,
    onAccountTap: (SavedAccount) -> Unit,
    onAccountRemove: (String) -> Unit,
    onOtherAccount: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Column(modifier = modifier, horizontalAlignment = Alignment.CenterHorizontally) {
        accounts.forEach { account ->
            SavedAccountRow(
                account = account,
                onTap = { onAccountTap(account) },
                onRemove = { onAccountRemove(account.id) },
                modifier = Modifier.fillMaxWidth().padding(top = MeeshySpacing.md),
            )
        }

        errorText?.let { message ->
            Text(
                text = message,
                color = MeeshyTheme.tokens.error,
                style = MaterialTheme.typography.bodySmall,
                modifier = Modifier.fillMaxWidth().padding(top = MeeshySpacing.md),
            )
        }

        TextButton(onClick = onOtherAccount, modifier = Modifier.padding(top = MeeshySpacing.xs)) {
            Text(
                text = stringResource(R.string.login_other_account),
                style = MaterialTheme.typography.bodySmall,
                fontWeight = FontWeight.SemiBold,
                color = MeeshyTheme.tokens.textSecondary,
            )
        }
    }
}

/**
 * One row of [SavedAccountsPicker] — tap selects the account, the trailing icon
 * removes it. iOS surfaces removal via a `.contextMenu` (long-press); a visible
 * trailing button is the Android-idiomatic equivalent (Compose has no first-class
 * context-menu primitive) — same capability, platform-native discovery.
 */
@Composable
private fun SavedAccountRow(
    account: SavedAccount,
    onTap: () -> Unit,
    onRemove: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Surface(
        onClick = onTap,
        modifier = modifier,
        shape = MaterialTheme.shapes.medium,
        color = MeeshyTheme.tokens.backgroundSecondary,
    ) {
        Row(
            verticalAlignment = Alignment.CenterVertically,
            modifier = Modifier.padding(horizontal = MeeshySpacing.lg, vertical = MeeshySpacing.md),
        ) {
            MeeshyAvatar(name = account.shortName, size = 44.dp)

            Column(modifier = Modifier.padding(start = MeeshySpacing.md).weight(1f)) {
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

            Icon(
                imageVector = Icons.AutoMirrored.Filled.KeyboardArrowRight,
                contentDescription = null,
                tint = MeeshyTheme.tokens.textMuted,
            )

            IconButton(onClick = onRemove) {
                Icon(
                    imageVector = Icons.Filled.Close,
                    contentDescription = stringResource(R.string.login_remove_account),
                    tint = MeeshyTheme.tokens.textMuted,
                )
            }
        }
    }
}

/** The selected account's password prompt — iOS `LoginView.selectedAccountView`. */
@Composable
private fun SelectedAccountForm(
    account: SavedAccount,
    state: AuthUiState,
    viewModel: AuthViewModel,
    modifier: Modifier = Modifier,
) {
    Column(modifier = modifier, horizontalAlignment = Alignment.CenterHorizontally) {
        Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.fillMaxWidth()) {
            IconButton(onClick = viewModel::deselectAccount) {
                Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = stringResource(R.string.registration_back))
            }
            Spacer(modifier = Modifier.width(MeeshySpacing.sm))
            MeeshyAvatar(name = account.shortName, size = 40.dp)
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

        OutlinedTextField(
            value = state.password,
            onValueChange = viewModel::onPasswordChange,
            label = { Text(stringResource(R.string.login_password_label)) },
            singleLine = true,
            visualTransformation = PasswordVisualTransformation(),
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password),
            enabled = !state.isSubmitting,
            modifier = Modifier.fillMaxWidth().padding(top = MeeshySpacing.lg),
        )

        state.errorMessage?.let { message ->
            Text(
                text = message,
                color = MeeshyTheme.tokens.error,
                style = MaterialTheme.typography.bodySmall,
                modifier = Modifier.fillMaxWidth().padding(top = MeeshySpacing.md),
            )
        }

        MeeshyPrimaryButton(
            text = stringResource(R.string.login_button),
            onClick = viewModel::login,
            enabled = state.canSubmit,
            loading = state.isSubmitting,
            modifier = Modifier.fillMaxWidth().padding(top = MeeshySpacing.xl),
        )
    }
}

/** The plain credential form — iOS `LoginView.normalLoginSection`. */
@Composable
private fun NormalLoginForm(
    state: AuthUiState,
    viewModel: AuthViewModel,
    showBackToPicker: Boolean,
) {
    if (showBackToPicker) {
        Row(
            verticalAlignment = Alignment.CenterVertically,
            modifier = Modifier.fillMaxWidth().padding(top = MeeshySpacing.xl),
        ) {
            TextButton(onClick = viewModel::backToSavedAccounts) {
                Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = null, tint = MeeshyTheme.tokens.textMuted)
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

    OutlinedTextField(
        value = state.username,
        onValueChange = viewModel::onUsernameChange,
        label = { Text(stringResource(R.string.login_username_label)) },
        singleLine = true,
        enabled = !state.isSubmitting,
        modifier = Modifier
            .fillMaxWidth()
            .padding(top = if (showBackToPicker) MeeshySpacing.md else MeeshySpacing.xl),
    )

    OutlinedTextField(
        value = state.password,
        onValueChange = viewModel::onPasswordChange,
        label = { Text(stringResource(R.string.login_password_label)) },
        singleLine = true,
        visualTransformation = PasswordVisualTransformation(),
        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password),
        enabled = !state.isSubmitting,
        modifier = Modifier
            .fillMaxWidth()
            .padding(top = MeeshySpacing.md),
    )

    val errorText = state.errorRes?.let { stringResource(it) } ?: state.errorMessage
    errorText?.let { message ->
        Text(
            text = message,
            color = MeeshyTheme.tokens.error,
            style = MaterialTheme.typography.bodySmall,
            modifier = Modifier
                .fillMaxWidth()
                .padding(top = MeeshySpacing.md),
        )
    }

    MeeshyPrimaryButton(
        text = stringResource(R.string.login_button),
        onClick = viewModel::login,
        enabled = state.canSubmit,
        loading = state.isSubmitting,
        modifier = Modifier
            .fillMaxWidth()
            .padding(top = MeeshySpacing.xl),
    )
}
