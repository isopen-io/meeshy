package me.meeshy.feature.kit

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.style.TextAlign
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme

/**
 * L'état vide du catalogue : aucun composant n'est livré, et une phrase le dit sur le fond du thème. L'écran du
 * catalogue et le premier instantané de K00 partagent cette vue, donc l'image prouve exactement ce que l'écran montre.
 */
@Composable
public fun MeeshyKitCatalogEmptyState(modifier: Modifier = Modifier) {
    Text(
        text = KitCatalogLabels.EMPTY,
        style = MaterialTheme.typography.bodyLarge,
        textAlign = TextAlign.Center,
        color = MeeshyTheme.tokens.textSecondary,
        modifier = modifier
            .fillMaxWidth()
            .background(MeeshyTheme.tokens.backgroundPrimary)
            .padding(MeeshySpacing.lg),
    )
}
