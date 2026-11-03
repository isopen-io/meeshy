package me.meeshy.app.auth

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.delay
import me.meeshy.feature.auth.R
import me.meeshy.ui.component.auth.AuthActionButton
import me.meeshy.ui.component.auth.AuthContentType
import me.meeshy.ui.component.auth.AuthTextField
import me.meeshy.ui.icons.MeeshyIcons
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme

/**
 * iOS `LoginView.twoFactorSection` : bouclier, code TOTP ou code de secours, « Se connecter », « Annuler ».
 * Le retour système est « Annuler » : il quitte l'étape en oubliant le défi, jamais l'écran avec le défi en mémoire.
 */
@Composable
internal fun LoginTwoFactorStep(
    state: AuthUiState,
    onCodeChange: (String) -> Unit,
    onSubmit: () -> Unit,
    onCancel: () -> Unit,
    modifier: Modifier = Modifier,
) {
    BackHandler { if (!state.isSubmitting) onCancel() }
    val focus = remember { FocusRequester() }
    LaunchedEffect(Unit) {
        delay(CODE_FOCUS_DELAY_MS)
        focus.requestFocus()
    }
    val fieldLabel = stringResource(R.string.auth_login_two_factor_label)
    ChallengeColumn(
        icon = { Icon(MeeshyIcons.ShieldFilled, contentDescription = null, tint = MeeshyPalette.Indigo500, modifier = Modifier.size(48.dp)) },
        title = stringResource(R.string.auth_login_two_factor_title),
        description = stringResource(R.string.login_two_factor_description_with_backup),
        modifier = modifier,
    ) {
        AuthTextField(
            value = state.twoFactorCode,
            onValueChange = onCodeChange,
            title = stringResource(R.string.auth_login_two_factor_placeholder),
            icon = MeeshyIcons.Key,
            contentType = AuthContentType.TwoFactorCode,
            imeAction = ImeAction.Done,
            onImeAction = onSubmit,
            enabled = !state.isSubmitting,
            modifier = Modifier
                .fillMaxWidth()
                .focusRequester(focus)
                .semantics { contentDescription = fieldLabel },
        )
        ChallengeError(state)
        AuthActionButton(
            title = stringResource(R.string.login_button),
            onClick = onSubmit,
            enabled = state.canSubmitTwoFactor,
            isLoading = state.isSubmitting,
            modifier = Modifier.fillMaxWidth().padding(top = MeeshySpacing.md),
        )
        TextButton(onClick = onCancel, enabled = !state.isSubmitting, modifier = Modifier.fillMaxWidth()) {
            Text(stringResource(android.R.string.cancel), color = MeeshyTheme.tokens.textMuted, fontWeight = FontWeight.SemiBold)
        }
    }
}
