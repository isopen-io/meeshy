package me.meeshy.ui.component.composer

import androidx.compose.material3.AlertDialog
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable

/**
 * La question qu'un compositeur pose avant de perdre quelque chose — une diapo (#13616), un brouillon (#13838) : un titre,
 * l'action qui perd (en rouge) et celle qui ne perd rien. Toucher à côté ([onDismissRequest]) ne fait ni l'une ni l'autre.
 */
@Composable
public fun ComposerConfirmationDialog(
    title: String,
    destructiveLabel: String,
    onDestructive: () -> Unit,
    safeLabel: String,
    onSafe: () -> Unit,
    onDismissRequest: () -> Unit,
) {
    AlertDialog(
        onDismissRequest = onDismissRequest,
        title = { Text(title) },
        confirmButton = {
            TextButton(onClick = onDestructive) { Text(destructiveLabel, color = MaterialTheme.colorScheme.error) }
        },
        dismissButton = { TextButton(onClick = onSafe) { Text(safeLabel) } },
    )
}
