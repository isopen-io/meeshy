package me.meeshy.app.auth

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import me.meeshy.feature.auth.R
import me.meeshy.sdk.model.auth.ServerEnvironment
import me.meeshy.ui.icons.MeeshyIcons
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme

/** Developer/QA backend picker — iOS `LoginView.environmentSelector`. */
@Composable
internal fun EnvironmentSelector(
    state: AuthUiState,
    onSelect: (ServerEnvironment) -> Unit,
    onCustomHostChange: (String) -> Unit,
    onApplyCustomHost: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Column(modifier = modifier, horizontalAlignment = Alignment.CenterHorizontally) {
        Row(horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.sm)) {
            ServerEnvironment.entries.forEach { env ->
                FilterChip(
                    selected = state.selectedEnvironment == env,
                    onClick = { onSelect(env) },
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
                    onValueChange = onCustomHostChange,
                    label = { Text(stringResource(R.string.login_custom_host_label)) },
                    singleLine = true,
                    modifier = Modifier.weight(1f),
                )
                IconButton(onClick = onApplyCustomHost, enabled = state.canApplyCustomHost) {
                    Icon(
                        imageVector = MeeshyIcons.Check,
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

