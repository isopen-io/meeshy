package me.meeshy.app.conversations

import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import me.meeshy.feature.conversations.R
import me.meeshy.sdk.model.search.SearchExcerpt
import me.meeshy.sdk.model.search.SearchMediaKind
import me.meeshy.ui.component.VeiledTextBars
import me.meeshy.ui.icons.MeeshyIcons
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme

/**
 * L'extrait d'un message trouvé (#16957, #16958). Un extrait voilé ne porte aucun texte : des barres
 * floutées le remplacent, lisibles par personne, même sous l'API 31 où `Modifier.blur` ne fait rien.
 * L'icône du média d'une transcription est décorative : la ligne n'a qu'un geste, ouvrir la conversation.
 */
@Composable
internal fun MessageHitExcerpt(excerpt: SearchExcerpt, resultsQuery: String) {
    Row(verticalAlignment = Alignment.CenterVertically) {
        excerpt.media?.let { media ->
            Icon(
                imageVector = mediaIcon(media),
                contentDescription = null,
                tint = MeeshyTheme.tokens.textMuted,
                modifier = Modifier.size(14.dp),
            )
            Spacer(Modifier.width(MeeshySpacing.xs))
        }
        when (excerpt) {
            is SearchExcerpt.Veiled -> VeiledTextBars(tint = MeeshyTheme.tokens.textMuted)
            is SearchExcerpt.Shown -> {
                val highlighted = remember(excerpt.text, resultsQuery) {
                    washed(GlobalSearchRows.highlight(excerpt.text, resultsQuery), SEARCH_HIGHLIGHT_WASH)
                }
                Text(
                    text = highlighted,
                    style = MaterialTheme.typography.bodySmall,
                    color = MeeshyTheme.tokens.textSecondary,
                    maxLines = 2,
                )
            }
        }
    }
}

/** Le nom du média qui précède une transcription dans le libellé lu. */
@Composable
internal fun mediaTranscriptLabel(): (SearchMediaKind) -> String {
    val audio = stringResource(R.string.global_search_transcript_audio)
    val video = stringResource(R.string.global_search_transcript_video)
    val image = stringResource(R.string.global_search_transcript_image)
    val document = stringResource(R.string.global_search_transcript_document)
    return { kind ->
        when (kind) {
            SearchMediaKind.AUDIO -> audio
            SearchMediaKind.VIDEO -> video
            SearchMediaKind.IMAGE -> image
            SearchMediaKind.DOCUMENT -> document
        }
    }
}

private fun mediaIcon(kind: SearchMediaKind): ImageVector = when (kind) {
    SearchMediaKind.AUDIO -> MeeshyIcons.Mic
    SearchMediaKind.VIDEO -> MeeshyIcons.Video
    SearchMediaKind.IMAGE -> MeeshyIcons.PhotoFilled
    SearchMediaKind.DOCUMENT -> MeeshyIcons.Document
}
