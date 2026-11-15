package me.meeshy.app.auth

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.expandVertically
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.shrinkVertically
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.selection.toggleable
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Switch
import androidx.compose.material3.SwitchDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import me.meeshy.feature.auth.R
import me.meeshy.ui.haptics.rememberMeeshyHaptics
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme

/**
 * « Rester connecté sur cet appareil » (iOS `LoginView.keepSignedInToggle`, #8286) : proposée dès
 * qu'un AUTRE compte garde sa session ([AuthUiState.offersKeepSignedIn]) — le premier compte de
 * l'appareil est gardé sans question. Elle entre et sort en fondu déplié ; toute la rangée est la cible
 * du geste (lecteur d'écran : un interrupteur nommé), avec un tic léger.
 */
@Composable
internal fun KeepSignedInToggle(
    state: AuthUiState,
    onChange: (Boolean) -> Unit,
    modifier: Modifier = Modifier,
) {
    val haptics = rememberMeeshyHaptics()
    AnimatedVisibility(
        visible = state.offersKeepSignedIn,
        enter = fadeIn() + expandVertically(),
        exit = fadeOut() + shrinkVertically(),
        modifier = modifier,
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .heightIn(min = 48.dp)
                .padding(top = MeeshySpacing.sm)
                .toggleable(
                    value = state.keepSignedIn,
                    enabled = !state.isSubmitting,
                    role = Role.Switch,
                    onValueChange = {
                        haptics.light()
                        onChange(it)
                    },
                ),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text(
                text = stringResource(R.string.login_keep_signed_in),
                style = MaterialTheme.typography.bodyMedium,
                fontWeight = FontWeight.Medium,
                color = MeeshyTheme.tokens.textPrimary,
                modifier = Modifier.weight(1f),
            )
            Switch(
                checked = state.keepSignedIn,
                onCheckedChange = null,
                colors = SwitchDefaults.colors(checkedTrackColor = MeeshyPalette.Indigo500),
            )
        }
    }
}
