package me.meeshy.ui.component.people

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import me.meeshy.ui.theme.MeeshyFontSize
import me.meeshy.ui.theme.MeeshyIconSize
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme

/**
 * L'état vide illustré des écrans Personnes : icône, titre et sous-titre optionnel, centrés, aux teintes du
 * thème (clair et sombre). Titre et sous-titre forment un seul nœud TalkBack ; l'icône est décorative.
 */
@Composable
public fun PeopleEmptyState(
    icon: ImageVector,
    title: String,
    modifier: Modifier = Modifier,
    subtitle: String? = null,
) {
    val tokens = MeeshyTheme.tokens
    Column(
        modifier = modifier.fillMaxSize().padding(horizontal = MeeshySpacing.xxxl),
        verticalArrangement = Arrangement.spacedBy(MeeshySpacing.md, Alignment.CenterVertically),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Icon(
            imageVector = icon,
            contentDescription = null,
            tint = tokens.textMuted,
            modifier = Modifier.size(MeeshyIconSize.hero).clearAndSetSemantics { },
        )
        Column(
            modifier = Modifier.semantics(mergeDescendants = true) { },
            verticalArrangement = Arrangement.spacedBy(MeeshySpacing.xs),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            Text(
                text = title,
                color = tokens.textPrimary,
                fontSize = MeeshyFontSize.headline,
                fontWeight = FontWeight.SemiBold,
                textAlign = TextAlign.Center,
            )
            if (!subtitle.isNullOrEmpty()) {
                Text(
                    text = subtitle,
                    color = tokens.textMuted,
                    fontSize = MeeshyFontSize.label,
                    textAlign = TextAlign.Center,
                )
            }
        }
    }
}
