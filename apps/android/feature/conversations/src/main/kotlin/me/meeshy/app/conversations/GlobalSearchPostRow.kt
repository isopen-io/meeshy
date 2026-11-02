package me.meeshy.app.conversations

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import me.meeshy.feature.conversations.R
import me.meeshy.sdk.model.PostType
import me.meeshy.sdk.model.search.PostSearchHit
import me.meeshy.ui.component.MeeshyAvatar
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme
import me.meeshy.ui.icons.MeeshyIcons

/**
 * Une publication trouvée (#14620) : l'auteur, le genre (post, réel, story), le texte servi par
 * le Prisme. Un toucher ouvre le contenu.
 */
@Composable
internal fun PostHitRow(
    hit: PostSearchHit,
    onClick: () -> Unit,
) {
    val kind = stringResource(hit.kind.labelRes())
    ResultCard(
        onClick = onClick,
        description = listOf(kind, hit.authorName, hit.text).filter { it.isNotBlank() }.joinToString(", "),
        hint = kind,
    ) {
        MeeshyAvatar(name = hit.authorName, size = 40.dp, imageUrl = hit.authorAvatar)
        Spacer(Modifier.width(MeeshySpacing.md))
        Column(modifier = Modifier.weight(1f)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Icon(
                    imageVector = hit.kind.icon(),
                    contentDescription = null,
                    tint = MeeshyPalette.Indigo500,
                    modifier = Modifier.size(14.dp),
                )
                Spacer(Modifier.width(MeeshySpacing.xs))
                Text(
                    text = kind,
                    style = MaterialTheme.typography.labelMedium,
                    color = MeeshyPalette.Indigo500,
                    maxLines = 1,
                )
            }
            Text(
                text = hit.authorName,
                style = MaterialTheme.typography.titleSmall,
                color = MeeshyTheme.tokens.textPrimary,
                maxLines = 1,
            )
            if (hit.text.isNotBlank()) {
                Text(
                    text = hit.text,
                    style = MaterialTheme.typography.bodySmall,
                    color = MeeshyTheme.tokens.textSecondary,
                    maxLines = 2,
                )
            }
        }
    }
}

private fun PostType.labelRes(): Int = when (this) {
    PostType.REEL -> R.string.global_search_post_kind_reel
    PostType.STORY -> R.string.global_search_post_kind_story
    else -> R.string.global_search_post_kind_post
}

private fun PostType.icon(): ImageVector = when (this) {
    PostType.REEL -> MeeshyIcons.Movie
    PostType.STORY -> MeeshyIcons.Slideshow
    else -> MeeshyIcons.GridViewFilled
}
