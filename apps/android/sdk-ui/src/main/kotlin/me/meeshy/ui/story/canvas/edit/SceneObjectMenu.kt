package me.meeshy.ui.story.canvas.edit

import androidx.compose.foundation.layout.heightIn
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.unit.dp
import me.meeshy.ui.theme.MeeshyPalette

/** Une entrée du menu d'appui long : déjà libellée, déjà filtrée par le plan (une action sans effet n'y figure pas). */
public data class SceneObjectMenuItem(
    val label: String,
    val destructive: Boolean = false,
    val onClick: () -> Unit,
)

/**
 * Le menu d'appui long d'un objet de la scène. Il peint ce que le plan lui remet, dans son ordre, sans jamais
 * griser : la règle « absente, jamais grisée » est tenue par le plan. Chaque rangée fait au moins 48 dp et la
 * suppression, dernière, est en alerte.
 */
@Composable
public fun SceneObjectMenu(
    expanded: Boolean,
    items: List<SceneObjectMenuItem>,
    onDismiss: () -> Unit,
) {
    DropdownMenu(expanded = expanded && items.isNotEmpty(), onDismissRequest = onDismiss) {
        items.forEach { item ->
            DropdownMenuItem(
                text = {
                    Text(
                        text = item.label,
                        style = MaterialTheme.typography.bodyLarge,
                        color = if (item.destructive) MeeshyPalette.Error else MaterialTheme.colorScheme.onSurface,
                    )
                },
                onClick = {
                    item.onClick()
                    onDismiss()
                },
                modifier = androidx.compose.ui.Modifier.heightIn(min = 48.dp),
            )
        }
    }
}
