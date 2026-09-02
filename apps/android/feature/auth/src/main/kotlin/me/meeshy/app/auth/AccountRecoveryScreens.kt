package me.meeshy.app.auth

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.MarkEmailRead
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.systemBarsPadding
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.ui.text.input.KeyboardType
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import me.meeshy.feature.auth.R
import me.meeshy.sdk.model.auth.EmailRecoveryStep
import me.meeshy.ui.component.chrome.MeeshyBackground
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme

/** Mot de passe oublie (volet email) — le lien de reinitialisation part par email. */
@Composable
fun ForgotPasswordScreen(
    onBack: () -> Unit,
    viewModel: ForgotPasswordViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsStateWithLifecycle()

    RecoveryScaffold(title = stringResource(R.string.auth_forgot_title), onBack = onBack) {
        when (state.recovery.step) {
            EmailRecoveryStep.INPUT -> {
                Text(
                    text = stringResource(R.string.auth_forgot_subtitle),
                    style = MaterialTheme.typography.bodyMedium,
                    color = MeeshyTheme.tokens.textSecondary,
                )
                OutlinedTextField(
                    value = state.email,
                    onValueChange = viewModel::setEmail,
                    label = { Text(stringResource(R.string.auth_email_label)) },
                    singleLine = true,
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Email),
                    modifier = Modifier.fillMaxWidth(),
                )
                state.errorMessage?.let {
                    Text(text = it, color = MeeshyPalette.Error, style = MaterialTheme.typography.bodySmall)
                }
                Button(
                    onClick = viewModel::send,
                    enabled = state.canSend,
                    modifier = Modifier.fillMaxWidth(),
                ) {
                    if (state.isSubmitting) {
                        CircularProgressIndicator(modifier = Modifier.size(18.dp), strokeWidth = 2.dp)
                    } else {
                        Text(stringResource(R.string.auth_forgot_send))
                    }
                }
            }
            EmailRecoveryStep.SENT -> SentConfirmation(
                message = stringResource(
                    R.string.auth_forgot_sent,
                    state.recovery.submittedEmail.orEmpty(),
                ),
                onBack = onBack,
            )
        }
    }
}

/** Connexion par magic link : demande + compte a rebours + renvoi a expiration. */
@Composable
fun MagicLinkScreen(
    onBack: () -> Unit,
    viewModel: MagicLinkViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsStateWithLifecycle()

    RecoveryScaffold(title = stringResource(R.string.auth_magic_title), onBack = onBack) {
        if (state.sentTo == null) {
            Text(
                text = stringResource(R.string.auth_magic_subtitle),
                style = MaterialTheme.typography.bodyMedium,
                color = MeeshyTheme.tokens.textSecondary,
            )
            OutlinedTextField(
                value = state.email,
                onValueChange = viewModel::setEmail,
                label = { Text(stringResource(R.string.auth_email_label)) },
                singleLine = true,
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Email),
                modifier = Modifier.fillMaxWidth(),
            )
            state.errorMessage?.let {
                Text(text = it, color = MeeshyPalette.Error, style = MaterialTheme.typography.bodySmall)
            }
            Button(
                onClick = viewModel::send,
                enabled = state.canSend,
                modifier = Modifier.fillMaxWidth(),
            ) {
                if (state.isSubmitting) {
                    CircularProgressIndicator(modifier = Modifier.size(18.dp), strokeWidth = 2.dp)
                } else {
                    Text(stringResource(R.string.auth_magic_send))
                }
            }
        } else {
            SentConfirmation(
                message = stringResource(R.string.auth_magic_sent, state.sentTo.orEmpty()),
                onBack = null,
            )
            val countdown = state.countdown
            if (countdown != null) {
                if (countdown.showCountdown) {
                    Text(
                        text = stringResource(R.string.auth_magic_countdown, countdown.formatted),
                        style = MaterialTheme.typography.titleMedium,
                        color = MeeshyPalette.Indigo500,
                        fontWeight = FontWeight.Bold,
                    )
                }
                if (countdown.showExpiredWarning) {
                    Text(
                        text = stringResource(R.string.auth_magic_expired),
                        style = MaterialTheme.typography.bodyMedium,
                        color = MeeshyPalette.Warning,
                    )
                }
                TextButton(
                    onClick = viewModel::send,
                    enabled = state.canResend,
                ) {
                    Text(stringResource(R.string.auth_magic_resend))
                }
            }
        }
    }
}

@Composable
private fun RecoveryScaffold(
    title: String,
    onBack: () -> Unit,
    content: @Composable () -> Unit,
) {
    MeeshyBackground {
        Column(
            modifier = Modifier
                .fillMaxSize()
                // Cet ecran n'a pas de Scaffold : depuis que le Scaffold racine ne
                // reserve plus les barres systeme (MeeshyApp.kt, contentWindowInsets
                // a zero), il pose lui-meme son inset. Le fond reste PLEIN ECRAN,
                // seul le CONTENU est retreci — c'est exactement la geometrie
                // d'avant, le degrade en plus.
                .systemBarsPadding()
                .verticalScroll(rememberScrollState())
                .padding(horizontal = MeeshySpacing.xl),
            verticalArrangement = Arrangement.spacedBy(MeeshySpacing.lg),
        ) {
            Row(
                verticalAlignment = Alignment.CenterVertically,
                modifier = Modifier.padding(top = MeeshySpacing.xl),
            ) {
                IconButton(onClick = onBack) {
                    Icon(
                        imageVector = Icons.AutoMirrored.Filled.ArrowBack,
                        contentDescription = stringResource(R.string.auth_back),
                        tint = MeeshyTheme.tokens.textPrimary,
                    )
                }
                Text(
                    text = title,
                    style = MaterialTheme.typography.headlineSmall,
                    color = MeeshyTheme.tokens.textPrimary,
                    fontWeight = FontWeight.Bold,
                )
            }
            content()
        }
    }
}

@Composable
private fun SentConfirmation(message: String, onBack: (() -> Unit)?) {
    Column(
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(MeeshySpacing.lg),
        modifier = Modifier.fillMaxWidth(),
    ) {
        Icon(
            imageVector = Icons.Filled.MarkEmailRead,
            contentDescription = null,
            tint = MeeshyPalette.Success,
            modifier = Modifier.size(56.dp),
        )
        Text(
            text = message,
            style = MaterialTheme.typography.bodyLarge,
            color = MeeshyTheme.tokens.textPrimary,
        )
        if (onBack != null) {
            TextButton(onClick = onBack) {
                Text(stringResource(R.string.auth_back_to_login))
            }
        }
    }
}
