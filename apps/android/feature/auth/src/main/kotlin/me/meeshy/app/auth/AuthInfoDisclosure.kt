package me.meeshy.app.auth

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Info
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme

/**
 * Le (i) des écrans d'authentification : une ligne visible, l'explication derrière.
 *
 * L'utilisateur n'a pas à lire comment fonctionne un écran pour s'en servir
 * (#6626) : ce qui n'est pas évident se déplie sous le (i), à la demande, et se
 * replie de la même main.
 *
 * Deux formes, un seul état :
 * - avec [title], le titre porte la ligne et le (i) se pose à sa droite — un
 *   bouton icône de 48 dp dont [label] est la description lue par TalkBack ;
 * - sans titre, [label] est lui-même visible, précédé de l'icône (« Rien reçu ? »).
 */
@Composable
internal fun AuthInfoDisclosure(
    label: String,
    text: String,
    modifier: Modifier = Modifier,
    title: String? = null,
) {
    var expanded by rememberSaveable { mutableStateOf(false) }
    val tint = if (expanded) MeeshyPalette.Indigo500 else MeeshyTheme.tokens.textSecondary

    Column(modifier = modifier.fillMaxWidth()) {
        if (title != null) {
            Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.fillMaxWidth()) {
                Text(
                    text = title,
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.SemiBold,
                    color = MeeshyTheme.tokens.textPrimary,
                    modifier = Modifier.weight(1f),
                )
                IconButton(onClick = { expanded = !expanded }) {
                    Icon(imageVector = Icons.Outlined.Info, contentDescription = label, tint = tint)
                }
            }
        } else {
            TextButton(onClick = { expanded = !expanded }) {
                Icon(
                    imageVector = Icons.Outlined.Info,
                    contentDescription = null,
                    tint = tint,
                    modifier = Modifier.size(18.dp),
                )
                Text(
                    text = label,
                    style = MaterialTheme.typography.bodyMedium,
                    color = MeeshyTheme.tokens.textSecondary,
                    modifier = Modifier.padding(start = MeeshySpacing.xs),
                )
            }
        }
        AnimatedVisibility(visible = expanded) {
            Text(
                text = text,
                style = MaterialTheme.typography.bodyMedium,
                color = MeeshyTheme.tokens.textSecondary,
                modifier = Modifier.padding(top = MeeshySpacing.xs),
            )
        }
    }
}
