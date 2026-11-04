package me.meeshy.app.feed

import me.meeshy.ui.icons.MeeshyIcons
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.foundation.layout.Column
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import me.meeshy.feature.feed.R
import me.meeshy.ui.component.MeeshyAvatar
import me.meeshy.ui.component.rememberPresence
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme

/**
 * Quand la puce de l'auteur se révèle dans l'en-tête flottant (iOS `CollapsibleHeader.centerReveal`) : dès que le bloc
 * auteur du corps du détail a quitté le haut de la zone défilante. Les deux ordonnées sont dans le MÊME repère
 * (celui de la racine), `authorBlockBottom` étant le bord bas du bloc, `viewportTop` le haut de la zone défilante.
 */
internal object PostDetailHeaderReveal {
    fun revealed(authorBlockBottom: Float, viewportTop: Float): Boolean = authorBlockBottom <= viewportTop
}

/**
 * La puce centrée de l'en-tête : avatar, nom, puis « @pseudo · vues · impressions » (statistiques de l'auteur seul).
 * Les chiffres ne se tronquent JAMAIS (2,3 M) : le pseudo cède d'abord, via sa priorité de largeur.
 */
@Composable
internal fun PostDetailAuthorChip(post: FeedPostPresentation, onOpenProfile: ((String) -> Unit)?, modifier: Modifier = Modifier) {
    val unknownAuthor = androidx.compose.ui.res.stringResource(R.string.feed_unknown_author)
    val name = post.authorName ?: unknownAuthor
    val reach = PostReachFormatter.components(
        username = post.authorUsername,
        isAuthor = post.isAuthor,
        viewCount = post.viewCount,
        impressionCount = post.impressionCount,
        uniqueViewCount = post.uniqueViewCount,
    )
    Row(
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.sm),
        modifier = modifier.opensAuthorProfile(post.authorProfile()),
    ) {
        MeeshyAvatar(
            name = name,
            size = 26.dp,
            imageUrl = post.authorAvatarUrl,
            presence = rememberPresence(post.authorId),
        )
        Column {
            Text(text = name, style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.Bold, maxLines = 1, overflow = TextOverflow.Ellipsis, color = MeeshyTheme.tokens.textPrimary)
            if (reach.pseudo != null || reach.views != null) {
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.xs)) {
                    reach.pseudo?.let {
                        Text(text = it, style = MaterialTheme.typography.labelSmall, color = MeeshyTheme.tokens.textSecondary, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f, fill = false))
                    }
                    if (reach.views != null && reach.impressions != null) {
                        ReachFigure(MeeshyIcons.EyeFilled, reach.views)
                        ReachFigure(MeeshyIcons.ChartBar, reach.impressions)
                    }
                }
            }
        }
    }
}

@Composable
private fun ReachFigure(icon: androidx.compose.ui.graphics.vector.ImageVector, figure: String) {
    Row(verticalAlignment = Alignment.CenterVertically) {
        Icon(icon, contentDescription = null, tint = MeeshyTheme.tokens.textSecondary, modifier = Modifier.size(12.dp))
        Spacer(Modifier.width(2.dp))
        Text(text = figure, style = MaterialTheme.typography.labelSmall, color = MeeshyTheme.tokens.textSecondary, maxLines = 1, softWrap = false)
    }
}
