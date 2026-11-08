package me.meeshy.app.auth

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.platform.LocalSoftwareKeyboardController
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.stateDescription
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.delay
import me.meeshy.feature.auth.R
import me.meeshy.sdk.model.auth.EmailProofError
import me.meeshy.sdk.model.auth.OtpCodeField
import me.meeshy.sdk.model.auth.OtpVerificationGate
import me.meeshy.ui.component.auth.AuthActionButton
import me.meeshy.ui.component.auth.AuthContentType
import me.meeshy.ui.component.auth.AuthTextField
import me.meeshy.ui.icons.MeeshyIcons
import me.meeshy.ui.theme.MeeshyRadius
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme

/**
 * Le champ du code à six chiffres, son erreur et « Vérifier » (iOS `EmailCodeEntry`, #8035) : sans état et
 * réutilisable par la feuille de la connexion, le lien magique, la carte d'inscription, la porte d'activation
 * et la carte e-mail d'onboarding. Clavier numérique + autofill du code SMS/e-mail, six chiffres exactement
 * ([OtpCodeField]), « Vérifier » actif à six chiffres, clavier masqué à la saisie complète.
 */
@Composable
internal fun EmailCodeEntry(
    code: String,
    gate: OtpVerificationGate,
    error: EmailProofError?,
    provenElsewhere: Boolean,
    onCodeChange: (String) -> Unit,
    onVerify: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val focus = remember { FocusRequester() }
    val keyboard = LocalSoftwareKeyboardController.current
    LaunchedEffect(Unit) {
        delay(CODE_FOCUS_DELAY_MS)
        focus.requestFocus()
    }
    LaunchedEffect(code) {
        if (OtpCodeField.isComplete(code)) keyboard?.hide()
    }
    val fieldLabel = stringResource(R.string.email_verification_code_a11y_label)
    val fieldHint = stringResource(R.string.email_verification_code_a11y_hint)
    val verifyingState = stringResource(R.string.email_verification_verifying_a11y)
    Column(modifier = modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(MeeshySpacing.md)) {
        AnimatedVisibility(visible = provenElsewhere) { ProvenElsewhereBanner() }
        AuthTextField(
            value = code,
            onValueChange = { onCodeChange(OtpCodeField.sanitize(it)) },
            title = stringResource(R.string.email_verification_code_placeholder),
            icon = MeeshyIcons.Mail,
            contentType = AuthContentType.OneTimeCode,
            imeAction = ImeAction.Go,
            onImeAction = onVerify,
            enabled = gate.isCodeEditable,
            modifier = Modifier
                .fillMaxWidth()
                .focusRequester(focus)
                .semantics { contentDescription = "$fieldLabel. $fieldHint" },
        )
        AuthErrorMessage(text = error?.let { stringResource(it.messageRes()) })
        AuthActionButton(
            title = stringResource(R.string.email_verification_verify_button),
            onClick = onVerify,
            enabled = gate.canVerify(code),
            isLoading = gate.isVerifying,
            modifier = Modifier
                .fillMaxWidth()
                .semantics { if (gate.isVerifying) stateDescription = verifyingState },
        )
    }
}

/** Le lien a été ouvert sur un autre appareil : l'adresse est confirmée, CE téléphone n'entre que par le code. */
@Composable
private fun ProvenElsewhereBanner() {
    val tokens = MeeshyTheme.tokens
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(MeeshyRadius.md))
            .background(tokens.success.copy(alpha = BANNER_TINT))
            .padding(MeeshySpacing.md)
            .semantics(mergeDescendants = true) { liveRegion = LiveRegionMode.Polite },
        horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.sm),
        verticalAlignment = Alignment.Top,
    ) {
        Icon(MeeshyIcons.Verified, contentDescription = null, tint = tokens.success, modifier = Modifier.size(24.dp))
        Column(verticalArrangement = Arrangement.spacedBy(MeeshySpacing.xs)) {
            Text(
                text = stringResource(R.string.email_verification_proven_elsewhere_title),
                style = MaterialTheme.typography.titleSmall,
                fontWeight = FontWeight.SemiBold,
                color = tokens.textPrimary,
            )
            Text(
                text = stringResource(R.string.email_verification_proven_elsewhere_body),
                style = MaterialTheme.typography.bodySmall,
                color = tokens.textSecondary,
            )
        }
    }
}

private const val BANNER_TINT = 0.12f

