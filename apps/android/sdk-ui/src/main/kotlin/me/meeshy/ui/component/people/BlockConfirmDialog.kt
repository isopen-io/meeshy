package me.meeshy.ui.component.people

import androidx.compose.foundation.layout.heightIn
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import me.meeshy.sdk.model.people.BlockConfirmWording
import me.meeshy.ui.theme.MeeshyTheme

/**
 * La confirmation unique de « Bloquer » (profil, fiche de participant, menu de conversation). Les libellés
 * viennent de l'appelant (chaque module porte les siens) ; [displayName] manquant retombe sur [fallbackName].
 * Le bouton de confirmation est rouge erreur, les deux cibles font au moins 48 dp.
 */
@Composable
public fun BlockConfirmDialog(
    displayName: String?,
    fallbackName: String,
    title: String,
    message: @Composable (name: String) -> String,
    confirmLabel: String,
    cancelLabel: String,
    onConfirm: () -> Unit,
    onDismiss: () -> Unit,
) {
    val name = BlockConfirmWording.displayName(displayName, fallbackName)
    AlertDialog(
        onDismissRequest = onDismiss,
        containerColor = MeeshyTheme.tokens.backgroundSecondary,
        title = { Text(title, color = MeeshyTheme.tokens.textPrimary) },
        text = { Text(message(name), color = MeeshyTheme.tokens.textSecondary) },
        confirmButton = {
            TextButton(onClick = onConfirm, modifier = Modifier.heightIn(min = 48.dp)) {
                Text(confirmLabel, color = MeeshyTheme.tokens.error)
            }
        },
        dismissButton = {
            TextButton(onClick = onDismiss, modifier = Modifier.heightIn(min = 48.dp)) {
                Text(cancelLabel, color = MeeshyTheme.tokens.textSecondary)
            }
        },
    )
}
