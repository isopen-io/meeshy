package me.meeshy.ui.component.chrome

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import me.meeshy.ui.R
import me.meeshy.ui.icons.MeeshyIcons
import me.meeshy.ui.theme.LocalMeeshyTokens
import me.meeshy.ui.theme.MeeshyRadius
import me.meeshy.ui.theme.MeeshySpacing

/**
 * Bandeau discret « Stockage indisponible, les données ne seront pas conservées », montré tant que la base est
 * éphémère (repli en mémoire). Le tap ouvre l'écran Mode dégradé ([onClick]). Le signal n'est pas porté par la seule
 * couleur : une icône et un texte l'accompagnent.
 */
@Composable
public fun StorageUnavailableBanner(onClick: () -> Unit, modifier: Modifier = Modifier) {
    val tokens = LocalMeeshyTokens.current
    Row(
        modifier = modifier
            .fillMaxWidth()
            .padding(horizontal = MeeshySpacing.lg, vertical = MeeshySpacing.xs)
            .background(tokens.warning.copy(alpha = 0.18f), RoundedCornerShape(MeeshyRadius.sm))
            .clickable(role = Role.Button, onClick = onClick)
            .heightIn(min = 48.dp)
            .padding(horizontal = MeeshySpacing.md, vertical = MeeshySpacing.sm),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(MeeshyIcons.WarningFilled, contentDescription = null, tint = tokens.warning, modifier = Modifier.size(18.dp))
        Text(
            text = stringResource(R.string.storage_unavailable_banner),
            color = tokens.textPrimary,
            maxLines = 2,
            overflow = TextOverflow.Ellipsis,
            modifier = Modifier.padding(start = MeeshySpacing.sm),
        )
    }
}
