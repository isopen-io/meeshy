package me.meeshy.ui.component.bring

import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import me.meeshy.ui.R
import me.meeshy.ui.theme.MeeshyPalette

/**
 * La confirmation du Bring qui dit l'usage et ses limites — « Meeshy n'est pas un service d'urgence ». UNE seule pour la
 * fiche et l'en-tête d'un direct (#17442) : le second geste qui fait sonner est le même partout.
 */
@Composable
fun BringConfirmDialog(name: String, onConfirm: () -> Unit, onDismiss: () -> Unit) {
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(stringResource(R.string.bring_confirm_title, name)) },
        text = { Text(stringResource(R.string.bring_confirm_body, name)) },
        confirmButton = {
            TextButton(onClick = onConfirm) {
                Text(
                    stringResource(R.string.bring_confirm_send),
                    color = MeeshyPalette.Error,
                    fontWeight = FontWeight.SemiBold,
                )
            }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) { Text(stringResource(R.string.common_cancel)) }
        },
    )
}
