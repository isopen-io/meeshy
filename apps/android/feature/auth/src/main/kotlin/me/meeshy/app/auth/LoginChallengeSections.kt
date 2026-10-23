package me.meeshy.app.auth

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Key
import androidx.compose.material.icons.filled.MarkEmailUnread
import androidx.compose.material.icons.filled.Shield
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.delay
import me.meeshy.feature.auth.R
import me.meeshy.sdk.model.auth.PasswordReveal
import me.meeshy.sdk.model.auth.PendingEmailVerification
import me.meeshy.ui.component.MeeshyPrimaryButton
import me.meeshy.ui.component.auth.PasswordEyeButton
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme

/** iOS `LoginView` : le champ code prend le focus 350 ms après l'apparition de l'étape. */
private const val CODE_FOCUS_DELAY_MS = 350L

/**
 * Le mot de passe de connexion : œil pour l'afficher (iOS `MeeshyPasswordField`), touche « Go »
 * du clavier qui lance la connexion (iOS `submitLabel(.go)`).
 */
@Composable
internal fun LoginPasswordField(
    value: String,
    onValueChange: (String) -> Unit,
    enabled: Boolean,
    onGo: () -> Unit,
    modifier: Modifier = Modifier,
) {
    var reveal by remember { mutableStateOf(PasswordReveal()) }
    OutlinedTextField(
        value = value,
        onValueChange = onValueChange,
        label = { Text(stringResource(R.string.login_password_label)) },
        singleLine = true,
        visualTransformation = if (reveal.isRevealed) VisualTransformation.None else PasswordVisualTransformation(),
        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password, imeAction = ImeAction.Go),
        keyboardActions = KeyboardActions(onGo = { onGo() }),
        trailingIcon = {
            PasswordEyeButton(
                reveal = reveal,
                tint = MeeshyTheme.tokens.textMuted,
                enabled = enabled,
                onToggle = { reveal = reveal.toggled() },
            )
        },
        enabled = enabled,
        modifier = modifier,
    )
}

/** iOS `LoginView.twoFactorSection` : bouclier, code à 6 chiffres, « Se connecter », « Annuler ». */
@Composable
internal fun TwoFactorSection(
    state: AuthUiState,
    onCodeChange: (String) -> Unit,
    onSubmit: () -> Unit,
    onCancel: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val focus = remember { FocusRequester() }
    LaunchedEffect(Unit) {
        delay(CODE_FOCUS_DELAY_MS)
        focus.requestFocus()
    }
    val fieldLabel = stringResource(R.string.auth_login_two_factor_label)
    ChallengeColumn(
        icon = { Icon(Icons.Filled.Shield, contentDescription = null, tint = MeeshyPalette.Indigo500, modifier = Modifier.size(48.dp)) },
        title = stringResource(R.string.auth_login_two_factor_title),
        description = stringResource(R.string.auth_login_two_factor_description),
        modifier = modifier,
    ) {
        OutlinedTextField(
            value = state.twoFactorCode,
            onValueChange = onCodeChange,
            placeholder = { Text(stringResource(R.string.auth_login_two_factor_placeholder)) },
            leadingIcon = { Icon(Icons.Filled.Key, contentDescription = null, tint = MeeshyPalette.Indigo500) },
            singleLine = true,
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.NumberPassword, imeAction = ImeAction.Go),
            keyboardActions = KeyboardActions(onGo = { onSubmit() }),
            enabled = !state.isSubmitting,
            modifier = Modifier
                .fillMaxWidth()
                .focusRequester(focus)
                .semantics { contentDescription = fieldLabel },
        )
        ChallengeError(state)
        MeeshyPrimaryButton(
            text = stringResource(R.string.login_button),
            onClick = onSubmit,
            enabled = state.canSubmitTwoFactor,
            loading = state.isSubmitting,
            modifier = Modifier.fillMaxWidth().padding(top = MeeshySpacing.md),
        )
        TextButton(onClick = onCancel, enabled = !state.isSubmitting, modifier = Modifier.fillMaxWidth()) {
            Text(stringResource(android.R.string.cancel), color = MeeshyTheme.tokens.textMuted, fontWeight = FontWeight.SemiBold)
        }
    }
}

/**
 * iOS `EmailVerificationView` : la passerelle a envoyé un code à l'adresse (`verification-required`).
 * Titre, pourquoi (compte créé, activation, code envoyé), code à 6 chiffres, « Vérifier »,
 * « Renvoyer le code », « Fermer ».
 */
@Composable
internal fun EmailVerificationSection(
    state: AuthUiState,
    pending: PendingEmailVerification,
    onCodeChange: (String) -> Unit,
    onSubmit: () -> Unit,
    onResend: () -> Unit,
    onClose: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val focus = remember { FocusRequester() }
    LaunchedEffect(Unit) {
        delay(CODE_FOCUS_DELAY_MS)
        focus.requestFocus()
    }
    val subtitleRes = when {
        pending.accountCreated -> R.string.email_verification_subtitle_account_created
        state.password.isNotEmpty() -> R.string.email_verification_subtitle_activation_required
        else -> R.string.email_verification_subtitle
    }
    val fieldLabel = stringResource(R.string.email_verification_code_a11y_label)
    ChallengeColumn(
        icon = {
            Icon(Icons.Filled.MarkEmailUnread, contentDescription = null, tint = MeeshyPalette.Indigo500, modifier = Modifier.size(48.dp))
        },
        title = stringResource(R.string.email_verification_title),
        description = stringResource(subtitleRes, pending.email),
        modifier = modifier,
    ) {
        Text(
            text = stringResource(R.string.email_verification_inbox_hint),
            style = MaterialTheme.typography.bodySmall,
            color = MeeshyTheme.tokens.textSecondary,
            textAlign = TextAlign.Center,
            modifier = Modifier.fillMaxWidth(),
        )
        OutlinedTextField(
            value = state.verificationCode,
            onValueChange = onCodeChange,
            placeholder = { Text(stringResource(R.string.email_verification_code_placeholder)) },
            singleLine = true,
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.NumberPassword, imeAction = ImeAction.Go),
            keyboardActions = KeyboardActions(onGo = { onSubmit() }),
            enabled = !state.isSubmitting,
            modifier = Modifier
                .fillMaxWidth()
                .padding(top = MeeshySpacing.md)
                .focusRequester(focus)
                .semantics { contentDescription = fieldLabel },
        )
        ChallengeError(state)
        MeeshyPrimaryButton(
            text = stringResource(R.string.email_verification_verify_button),
            onClick = onSubmit,
            enabled = state.canSubmitVerification,
            loading = state.isSubmitting,
            modifier = Modifier.fillMaxWidth().padding(top = MeeshySpacing.md),
        )
        Text(
            text = stringResource(R.string.email_verification_no_code),
            style = MaterialTheme.typography.bodySmall,
            color = MeeshyTheme.tokens.textMuted,
            modifier = Modifier.padding(top = MeeshySpacing.md),
        )
        TextButton(
            onClick = onResend,
            enabled = !state.isSubmitting && state.verificationResend == VerificationResend.IDLE,
        ) {
            Text(
                text = stringResource(
                    if (state.verificationResend == VerificationResend.SENT) {
                        R.string.email_verification_resend_confirmed
                    } else {
                        R.string.email_verification_resend_button
                    },
                ),
                fontWeight = FontWeight.SemiBold,
            )
        }
        TextButton(onClick = onClose, enabled = !state.isSubmitting, modifier = Modifier.fillMaxWidth()) {
            Text(stringResource(R.string.email_verification_nav_close), color = MeeshyTheme.tokens.textMuted)
        }
    }
}

@Composable
private fun ChallengeColumn(
    icon: @Composable () -> Unit,
    title: String,
    description: String,
    modifier: Modifier = Modifier,
    content: @Composable () -> Unit,
) {
    Column(
        modifier = modifier,
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(MeeshySpacing.sm),
    ) {
        icon()
        Text(
            text = title,
            style = MaterialTheme.typography.titleLarge,
            fontWeight = FontWeight.Bold,
            color = MeeshyTheme.tokens.textPrimary,
            modifier = Modifier.semantics { heading() },
        )
        Text(
            text = description,
            style = MaterialTheme.typography.bodyMedium,
            color = MeeshyTheme.tokens.textMuted,
            textAlign = TextAlign.Center,
            modifier = Modifier.padding(horizontal = MeeshySpacing.md).padding(bottom = MeeshySpacing.sm),
        )
        content()
    }
}

@Composable
private fun ChallengeError(state: AuthUiState) {
    val text = state.errorRes?.let { stringResource(it) } ?: state.errorMessage ?: return
    Text(
        text = text,
        color = MeeshyTheme.tokens.error,
        style = MaterialTheme.typography.bodySmall,
        modifier = Modifier.fillMaxWidth(),
    )
}
