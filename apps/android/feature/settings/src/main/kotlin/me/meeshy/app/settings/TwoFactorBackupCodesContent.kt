package me.meeshy.app.settings

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.selection.SelectionContainer
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.ContentCopy
import androidx.compose.material.icons.filled.VerifiedUser
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import me.meeshy.feature.settings.R
import me.meeshy.sdk.model.TwoFactorSetupStep
import me.meeshy.ui.haptics.MeeshyHaptics
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshyRadius
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme

/**
 * Écran des codes de secours : succès de l'activation (« 2FA activé avec succès ! »)
 * ou résultat d'une régénération. « Copier tous les codes » passe par le presse-papiers
 * sensible (effet émis par le ViewModel, écrit par l'écran).
 */
@Composable
internal fun BackupCodesContent(state: TwoFactorUiState, viewModel: TwoFactorViewModel, haptics: MeeshyHaptics) {
    val justActivated = state.flow.step == TwoFactorSetupStep.SUCCESS
    Column(
        modifier = Modifier.fillMaxWidth(),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(MeeshySpacing.lg),
    ) {
        if (justActivated) {
            Icon(
                Icons.Filled.VerifiedUser,
                contentDescription = null,
                tint = MeeshyPalette.Success,
                modifier = Modifier.size(56.dp),
            )
        }
        Text(
            text = stringResource(
                if (justActivated) R.string.twofactor_activated_title else R.string.twofactor_backup_codes_title,
            ),
            style = MaterialTheme.typography.titleMedium,
            fontWeight = FontWeight.Bold,
            color = MeeshyTheme.tokens.textPrimary,
            textAlign = TextAlign.Center,
        )
        Text(
            text = stringResource(R.string.twofactor_backup_codes_instruction),
            style = MaterialTheme.typography.bodyMedium,
            color = MeeshyTheme.tokens.textSecondary,
            textAlign = TextAlign.Center,
        )
        BackupCodesGrid(state.backupCodes)
        CopyAllCodesButton(copied = state.copiedCodes) {
            haptics.success()
            viewModel.copyBackupCodes()
        }
        Button(
            onClick = {
                haptics.medium()
                viewModel.acknowledgeBackupCodes()
            },
            modifier = Modifier.fillMaxWidth(),
            colors = ButtonDefaults.buttonColors(containerColor = MeeshyPalette.Indigo500),
        ) {
            Text(stringResource(R.string.twofactor_done_button))
        }
    }
}

@Composable
private fun BackupCodesGrid(codes: List<String>) {
    val shape = RoundedCornerShape(MeeshyRadius.sm)
    SelectionContainer {
        Column(verticalArrangement = Arrangement.spacedBy(MeeshySpacing.sm)) {
            codes.chunked(2).forEach { pair ->
                Row(horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.sm)) {
                    pair.forEach { code ->
                        Text(
                            text = code,
                            style = MaterialTheme.typography.bodyMedium.copy(fontFamily = FontFamily.Monospace),
                            fontWeight = FontWeight.SemiBold,
                            color = MeeshyTheme.tokens.textPrimary,
                            textAlign = TextAlign.Center,
                            modifier = Modifier
                                .weight(1f)
                                .clip(shape)
                                .background(MeeshyPalette.Indigo500.copy(alpha = 0.08f))
                                .border(1.dp, MeeshyPalette.Indigo500.copy(alpha = 0.2f), shape)
                                .padding(vertical = MeeshySpacing.sm),
                        )
                    }
                    if (pair.size == 1) Column(Modifier.weight(1f)) {}
                }
            }
        }
    }
}

@Composable
internal fun CopyAllCodesButton(copied: Boolean, onClick: () -> Unit) {
    val tint = if (copied) MeeshyPalette.Success else MeeshyPalette.Indigo500
    val label = stringResource(if (copied) R.string.twofactor_a11y_copied else R.string.twofactor_copy_all_codes)
    androidx.compose.material3.TextButton(onClick = onClick) {
        Icon(
            imageVector = if (copied) Icons.Filled.Check else Icons.Filled.ContentCopy,
            contentDescription = null,
            tint = tint,
            modifier = Modifier.size(18.dp),
        )
        androidx.compose.foundation.layout.Spacer(Modifier.size(MeeshySpacing.sm))
        Text(label, color = tint, fontWeight = FontWeight.SemiBold)
    }
}
