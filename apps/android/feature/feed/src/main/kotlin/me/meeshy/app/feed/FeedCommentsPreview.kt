package me.meeshy.app.feed

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.width
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.Immutable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.pluralStringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import me.meeshy.feature.feed.R
import me.meeshy.sdk.lang.LanguageResolver
import me.meeshy.sdk.model.ApiPostComment
import me.meeshy.sdk.model.MessageEffectFlags
import me.meeshy.sdk.model.displayContent
import me.meeshy.ui.component.MeeshyAvatar
import me.meeshy.ui.icons.MeeshyIcons
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme

/** Un commentaire montré sous une carte du fil : son auteur et son texte servi par le Prisme. */
@Immutable
data class FeedCommentPreviewRow(
    val id: String,
    val authorName: String,
    val authorAvatarUrl: String?,
    val text: String,
)

/**
 * **Les premiers commentaires sous une carte du fil** (#14314, iOS `FeedPostCard+CommentsPreview`) : les trois plus
 * aimés, puis « Voir les N commentaires » précédé des visages des commentateurs suivants. [total] est le compte du
 * post, jamais seulement ce que la passerelle a servi.
 */
@Immutable
data class FeedCommentsPreviewState(
    val top: List<FeedCommentPreviewRow>,
    val nextCommenters: List<FeedCommentPreviewRow>,
    val total: Int,
)

object FeedCommentsPreviewBuilder {
    private const val SHOWN = 3

    /**
     * Les commentaires de premier niveau servis avec le post, rangés par cœurs. Un commentaire flouté, éphémère ou à
     * vue unique ne s'affiche pas en clair sur la carte (la feuille, elle, porte son voile) ; un commentaire sans texte
     * (média seul) cède sa place. `null` : rien à montrer, la carte ne dessine rien.
     */
    fun build(
        comments: List<ApiPostComment>?,
        commentCount: Int,
        preferences: LanguageResolver.ContentLanguagePreferences,
        mediaBaseUrl: String?,
    ): FeedCommentsPreviewState? {
        val readable = comments.orEmpty()
            .filter { it.parentId.isNullOrBlank() && ((it.effectFlags ?: 0).toLong() and MessageEffectFlags.LIFECYCLE_MASK) == 0L }
            .mapNotNull { row(it, preferences, mediaBaseUrl) }
        if (readable.isEmpty()) return null
        val ranked = readable.sortedByDescending { it.second }.map { it.first }
        return FeedCommentsPreviewState(
            top = ranked.take(SHOWN),
            nextCommenters = ranked.drop(SHOWN).take(SHOWN),
            total = maxOf(commentCount, comments.orEmpty().count { it.parentId.isNullOrBlank() }),
        )
    }

    private fun row(
        comment: ApiPostComment,
        preferences: LanguageResolver.ContentLanguagePreferences,
        mediaBaseUrl: String?,
    ): Pair<FeedCommentPreviewRow, Int>? {
        val text = comment.displayContent(preferences).trim().takeIf { it.isNotEmpty() } ?: return null
        val author = comment.author
        return FeedCommentPreviewRow(
            id = comment.id,
            authorName = (author?.displayName ?: author?.username)?.takeIf { it.isNotBlank() }.orEmpty(),
            authorAvatarUrl = author?.avatar?.let { resolveFeedMediaUrl(it, mediaBaseUrl) },
            text = text,
        ) to (comment.likeCount ?: 0)
    }
}

/** L'aperçu sous la carte : un toucher n'importe où ouvre le fil des commentaires du post. */
@Composable
internal fun FeedCommentsPreview(preview: FeedCommentsPreviewState, onOpen: () -> Unit, modifier: Modifier = Modifier) {
    val label = pluralStringResource(R.plurals.feed_view_comments, preview.total, preview.total)
    Column(
        modifier
            .fillMaxWidth()
            .clickable(role = Role.Button, onClick = onOpen)
            .semantics(mergeDescendants = true) { contentDescription = label },
    ) {
        Spacer(Modifier.height(MeeshySpacing.sm))
        HorizontalDivider(color = MeeshyTheme.tokens.textSecondary.copy(alpha = 0.18f))
        Column(
            verticalArrangement = Arrangement.spacedBy(MeeshySpacing.md),
            modifier = Modifier.padding(top = MeeshySpacing.md),
        ) {
            preview.top.forEach { CommentPreviewRow(it) }
            SeeAllRow(preview, label)
        }
    }
}

@Composable
private fun CommentPreviewRow(row: FeedCommentPreviewRow) {
    Row(horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.sm), verticalAlignment = Alignment.Top) {
        MeeshyAvatar(name = row.authorName, size = 28.dp, imageUrl = row.authorAvatarUrl)
        Column(Modifier.weight(1f)) {
            if (row.authorName.isNotEmpty()) {
                Text(
                    row.authorName,
                    style = MaterialTheme.typography.labelLarge,
                    fontWeight = FontWeight.SemiBold,
                    color = MeeshyTheme.tokens.textPrimary,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
            }
            Text(
                row.text,
                style = MaterialTheme.typography.bodyMedium,
                color = MeeshyTheme.tokens.textPrimary,
                maxLines = 2,
                overflow = TextOverflow.Ellipsis,
            )
        }
    }
}

@Composable
private fun SeeAllRow(preview: FeedCommentsPreviewState, label: String) {
    Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.fillMaxWidth()) {
        if (preview.nextCommenters.isNotEmpty()) {
            Row(Modifier.width((20 + 14 * (preview.nextCommenters.size - 1)).dp)) {
                preview.nextCommenters.forEachIndexed { index, row ->
                    MeeshyAvatar(
                        name = row.authorName,
                        size = 20.dp,
                        imageUrl = row.authorAvatarUrl,
                        modifier = Modifier.offset(x = (-6 * index).dp),
                    )
                }
            }
            Spacer(Modifier.width(MeeshySpacing.sm))
        }
        Text(
            label,
            style = MaterialTheme.typography.labelLarge,
            fontWeight = FontWeight.SemiBold,
            color = MeeshyPalette.Indigo500,
            modifier = Modifier.weight(1f),
        )
        Icon(
            MeeshyIcons.ChevronForward,
            contentDescription = null,
            tint = MeeshyTheme.tokens.textSecondary,
            modifier = Modifier.size(16.dp),
        )
    }
}
