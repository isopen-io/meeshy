package me.meeshy.app.feed

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.defaultMinSize
import androidx.compose.foundation.layout.size
import androidx.compose.material3.Icon
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.onClick
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import me.meeshy.feature.feed.R
import me.meeshy.ui.icons.MeeshyIcons
import me.meeshy.ui.theme.MeeshyPalette

/**
 * Le glyphe « traduire » en tête de la bande de langues d'un post (iOS `TranslationsBadge`) :
 * touché, il ouvre l'explorateur de langues. Sans action, il reste un simple indicateur, retiré
 * de l'arbre d'accessibilité.
 */
@Composable
internal fun PostTranslationsBadge(onOpenExplorer: (() -> Unit)?, modifier: Modifier = Modifier) {
    val glyph: @Composable () -> Unit = {
        Icon(
            imageVector = MeeshyIcons.Translate,
            contentDescription = null,
            tint = MeeshyPalette.Indigo400,
            modifier = Modifier.size(14.dp),
        )
    }
    if (onOpenExplorer == null) {
        Box(modifier.semantics { contentDescription = "" }, contentAlignment = Alignment.Center) { glyph() }
        return
    }
    val label = stringResource(R.string.feed_translations_badge)
    val hint = stringResource(R.string.feed_translations_badge_hint)
    Box(
        modifier = modifier
            .defaultMinSize(minWidth = 32.dp, minHeight = 32.dp)
            .clickable(role = Role.Button, onClick = onOpenExplorer)
            .semantics {
                role = Role.Button
                contentDescription = "$label. $hint"
                onClick(label = hint) { onOpenExplorer(); true }
            },
        contentAlignment = Alignment.Center,
    ) { glyph() }
}
