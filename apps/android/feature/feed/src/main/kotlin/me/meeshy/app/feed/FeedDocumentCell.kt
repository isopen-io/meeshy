package me.meeshy.app.feed

import android.content.ActivityNotFoundException
import android.content.Context
import android.content.Intent
import android.net.Uri
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.border
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import me.meeshy.feature.feed.R
import me.meeshy.ui.icons.MeeshyIcons
import me.meeshy.ui.theme.MeeshyRadius
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme
import me.meeshy.ui.theme.hexColor

/**
 * **La carte d'un document du fil** (iOS `documentMediaView`) : glyphe teinté, nom du fichier (« Document » à défaut), taille puis
 * « • N pages » quand le serveur les donne. Un toucher ouvre le fichier avec l'application du système qui sait le lire.
 */
@Composable
internal fun FeedDocumentCell(item: FeedMediaItem, modifier: Modifier = Modifier) {
    val context = LocalContext.current
    val tint = hexColor(item.thumbnailColor, MeeshyTheme.tokens.textSecondary)
    val name = item.fileName?.takeIf { it.isNotBlank() } ?: stringResource(R.string.feed_post_detail_document)
    val pages = item.pageCount?.let { "$it ${stringResource(R.string.feed_post_detail_pages)}" }
    val meta = listOfNotNull(item.fileSizeLabel, pages).joinToString(" • ")
    val shape = RoundedCornerShape(MeeshyRadius.md)
    Row(
        modifier = modifier
            .fillMaxWidth()
            .heightIn(min = 48.dp)
            .clip(shape)
            .background(MeeshyTheme.tokens.textSecondary.copy(alpha = 0.06f))
            .border(BorderStroke(1.dp, tint.copy(alpha = 0.3f)), shape)
            .clickable(role = Role.Button) { openDocument(context, item.url) }
            .padding(MeeshySpacing.md)
            .semantics(mergeDescendants = true) { contentDescription = listOf(name, meta).filter { it.isNotEmpty() }.joinToString(". ") },
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.md),
    ) {
        Box(
            modifier = Modifier.size(width = 48.dp, height = 56.dp).clip(RoundedCornerShape(MeeshyRadius.sm)).background(tint.copy(alpha = 0.2f)),
            contentAlignment = Alignment.Center,
        ) {
            Icon(MeeshyIcons.Document, contentDescription = null, tint = tint, modifier = Modifier.size(24.dp))
        }
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(MeeshySpacing.xs)) {
            Text(
                text = name,
                style = MaterialTheme.typography.labelLarge,
                fontWeight = FontWeight.SemiBold,
                color = MeeshyTheme.tokens.textPrimary,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
            if (meta.isNotEmpty()) {
                Text(text = meta, style = MaterialTheme.typography.bodySmall, color = MeeshyTheme.tokens.textMuted)
            }
        }
    }
}

private fun openDocument(context: Context, url: String) {
    val intent = Intent(Intent.ACTION_VIEW, Uri.parse(url)).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
    try {
        context.startActivity(intent)
    } catch (_: ActivityNotFoundException) {
        // Aucune application ne lit ce fichier : le toucher reste sans effet, jamais un plantage.
    }
}
