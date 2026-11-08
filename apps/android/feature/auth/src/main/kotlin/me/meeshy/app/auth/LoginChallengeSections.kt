package me.meeshy.app.auth

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
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
import androidx.compose.ui.text.style.TextAlign
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

/** iOS `LoginView` : le champ code prend le focus 350 ms après l'apparition de l'étape. */
internal const val CODE_FOCUS_DELAY_MS = 350L

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
    AuthTextField(
        value = value,
        onValueChange = onValueChange,
        title = stringResource(R.string.login_password_label),
        icon = MeeshyIcons.Lock,
        isSecure = true,
        contentType = AuthContentType.Password,
        imeAction = ImeAction.Go,
        onImeAction = onGo,
        enabled = enabled,
        modifier = modifier,
    )
}

@Composable
internal fun ChallengeColumn(
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
internal fun ChallengeError(state: AuthUiState) {
    AuthErrorMessage(text = state.errorRes?.let { stringResource(it) } ?: state.errorMessage)
}
