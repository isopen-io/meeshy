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
import androidx.compose.ui.text.style.TextAlign
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
import me.meeshy.ui.theme.formColumnWidth

/**
 * Mot de passe oublié (volet e-mail) — et PREMIER mot de passe (#6645).
 *
 * Le lien reçu permet de choisir un mot de passe, qu'on en ait déjà eu un ou
 * jamais : l'écran le dit en une ligne, et le cas du compte ouvert sans mot de
 * passe se déplie sous son (i) ([AuthInfoDisclosure]). Une fois le lien parti,
 * l'écran se lit comme celui de la connexion par e-mail : mêmes mots, même aide
 * aux indésirables.
 */
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
                AuthInfoDisclosure(
                    label = stringResource(R.string.auth_forgot_never_had_label),
                    text = stringResource(R.string.auth_forgot_never_had_text),
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
            }
            EmailRecoveryStep.SENT -> {
                SentConfirmation(
                    title = stringResource(R.string.auth_magic_sent_title),
                    message = stringResource(R.string.auth_magic_sent, state.recovery.submittedEmail.orEmpty()),
                )
                AuthInfoDisclosure(
                    label = stringResource(R.string.auth_magic_nothing_label),
                    text = stringResource(R.string.auth_magic_nothing_text),
                )
                TextButton(onClick = onBack) {
                    Text(stringResource(R.string.auth_back_to_login))
                }
            }
        }
    }
}

/**
 * Connexion par e-mail : demande + compte a rebours + renvoi a expiration.
 *
 * L'ecran dit « e-mail », jamais le nom de la mecanique (#6626) : une ligne
 * visible par etat, le « comment ca marche » et l'aide aux indesirables derriere
 * leur (i) ([AuthInfoDisclosure]).
 */
@Composable
fun MagicLinkScreen(
    onBack: () -> Unit,
    viewModel: MagicLinkViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsStateWithLifecycle()

    RecoveryScaffold(title = stringResource(R.string.auth_magic_title), onBack = onBack) {
        if (state.sentTo == null) {
            AuthInfoDisclosure(
                title = stringResource(R.string.auth_magic_header),
                label = stringResource(R.string.auth_magic_how_label),
                text = stringResource(R.string.auth_magic_subtitle),
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
                title = stringResource(R.string.auth_magic_sent_title),
                message = stringResource(R.string.auth_magic_sent, state.sentTo.orEmpty()),
            )
            AuthInfoDisclosure(
                label = stringResource(R.string.auth_magic_nothing_label),
                text = stringResource(R.string.auth_magic_nothing_text),
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
                .formColumnWidth()
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
private fun SentConfirmation(title: String, message: String) {
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
            text = title,
            style = MaterialTheme.typography.titleLarge,
            color = MeeshyTheme.tokens.textPrimary,
            fontWeight = FontWeight.SemiBold,
            textAlign = TextAlign.Center,
        )
        Text(
            text = message,
            style = MaterialTheme.typography.bodyLarge,
            color = MeeshyTheme.tokens.textPrimary,
            textAlign = TextAlign.Center,
        )
    }
}
