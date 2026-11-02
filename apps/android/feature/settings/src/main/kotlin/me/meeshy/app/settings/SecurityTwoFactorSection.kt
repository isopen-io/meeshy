package me.meeshy.app.settings

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Shield
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import me.meeshy.feature.settings.R
import me.meeshy.ui.component.MeeshySkeletonBox
import me.meeshy.ui.haptics.rememberMeeshyHaptics
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme

/** Étape de [TwoFactorScreen] à laquelle chaque action de la section ouvre. */
internal enum class TwoFactorEntryStep(val arg: String) {
    SETUP("setup"),
    BACKUP_CODES("backup"),
    DISABLE("disable"),
}

@Composable
internal fun SecurityTwoFactorSection(
    status: TwoFactorStatusUi,
    onRetry: () -> Unit,
    onOpen: (TwoFactorEntryStep) -> Unit,
) {
    val haptics = rememberMeeshyHaptics()
    SecuritySectionCard(Icons.Filled.Shield, stringResource(R.string.twofactor_title)) {
        when (status) {
            TwoFactorStatusUi.Loading -> MeeshySkeletonBox(Modifier.fillMaxWidth().height(40.dp))
            TwoFactorStatusUi.Failed -> Row(verticalAlignment = Alignment.CenterVertically) {
                Text(
                    stringResource(R.string.twofactor_error_status),
                    style = MaterialTheme.typography.bodySmall,
                    color = MeeshyPalette.Error,
                    modifier = Modifier.weight(1f),
                )
                TextButton(onClick = { haptics.light(); onRetry() }) { Text(stringResource(R.string.sessions_retry)) }
            }
            is TwoFactorStatusUi.Known -> {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    SecurityFieldIcon(Icons.Filled.Shield)
                    Spacer(Modifier.size(MeeshySpacing.sm))
                    Text(
                        stringResource(
                            if (status.enabled) R.string.twofactor_status_enabled else R.string.twofactor_status_disabled,
                        ),
                        style = MaterialTheme.typography.bodyMedium,
                        fontWeight = FontWeight.Medium,
                        color = if (status.enabled) MeeshyPalette.Success else MeeshyTheme.tokens.textMuted,
                        modifier = Modifier.weight(1f),
                    )
                }
                Column(
                    modifier = Modifier.padding(top = MeeshySpacing.sm),
                    verticalArrangement = Arrangement.spacedBy(MeeshySpacing.xs),
                ) {
                    if (status.enabled) {
                        TextButton(onClick = { haptics.light(); onOpen(TwoFactorEntryStep.BACKUP_CODES) }) {
                            Text(stringResource(R.string.twofactor_backup_codes_title))
                        }
                        TextButton(onClick = { haptics.medium(); onOpen(TwoFactorEntryStep.DISABLE) }) {
                            Text(stringResource(R.string.twofactor_disable_confirm), color = MeeshyPalette.Error)
                        }
                    } else {
                        TextButton(onClick = { haptics.medium(); onOpen(TwoFactorEntryStep.SETUP) }) {
                            Text(stringResource(R.string.twofactor_setup_confirm))
                        }
                    }
                }
            }
        }
    }
}
