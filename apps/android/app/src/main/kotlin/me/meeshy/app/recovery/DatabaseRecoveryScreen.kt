package me.meeshy.app.recovery

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.unit.dp
import me.meeshy.app.R
import me.meeshy.ui.theme.LocalMeeshyTokens
import me.meeshy.ui.theme.MeeshySpacing

/**
 * L'écran « Mode dégradé » : explique que le stockage local s'est ouvert en repli, montre le journal d'ouverture de la
 * base, et propose Réessayer (relance de l'app) et Exporter le rapport.
 */
@Composable
fun DatabaseRecoveryScreen(
    report: String,
    onRetry: () -> Unit,
    onExport: () -> Unit,
    onDismiss: () -> Unit,
) {
    val tokens = LocalMeeshyTokens.current
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(stringResource(R.string.degraded_mode_title)) },
        text = {
            Column(Modifier.heightIn(max = 360.dp).verticalScroll(rememberScrollState())) {
                Text(stringResource(R.string.degraded_mode_body), color = tokens.textSecondary)
                if (report.isNotBlank()) {
                    Text(
                        text = report,
                        color = tokens.textMuted,
                        fontFamily = FontFamily.Monospace,
                        modifier = Modifier.padding(top = MeeshySpacing.md),
                    )
                }
            }
        },
        confirmButton = { TextButton(onClick = onRetry) { Text(stringResource(R.string.degraded_mode_retry)) } },
        dismissButton = { TextButton(onClick = onExport) { Text(stringResource(R.string.degraded_mode_export)) } },
    )
}
