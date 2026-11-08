package me.meeshy.app.conversations

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyListScope
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import me.meeshy.feature.conversations.R
import me.meeshy.sdk.model.ApiConversation
import me.meeshy.sdk.model.ApiMessage
import me.meeshy.sdk.model.ApiMessageSender
import me.meeshy.sdk.model.search.ListMessageHit
import me.meeshy.sdk.model.search.ListMessageSearchPhase
import me.meeshy.sdk.model.search.ListMessageSearchState
import me.meeshy.sdk.search.MessageSearchHit
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme
import java.time.Instant

/**
 * La section « Messages » sous les conversations trouvées (#14619) : la même ligne que l'onglet
 * Messages de la recherche globale, le texte servi par le Prisme, surligné contre la requête qui
 * l'a produit. Un extrait flouté se voile, une transcription se peint derrière l'icône de son
 * média. Un toucher ouvre la conversation SUR le message.
 */
internal fun LazyListScope.messageSearchItems(
    search: ListMessageSearchState,
    currentUserId: String?,
    conversationOf: (String) -> ApiConversation?,
    onOpen: (ListMessageHit) -> Unit,
) {
    if (!search.showsSection) return
    item(key = "message-search-header", contentType = "message-search-header") {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = MeeshySpacing.lg, vertical = MeeshySpacing.sm)
                .semantics { heading() },
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text(
                text = stringResource(R.string.global_search_tab_messages),
                style = MaterialTheme.typography.titleSmall,
                color = MeeshyTheme.tokens.textSecondary,
            )
            if (search.phase == ListMessageSearchPhase.SEARCHING || search.phase == ListMessageSearchPhase.REVALIDATING) {
                Spacer(Modifier.width(MeeshySpacing.sm))
                CircularProgressIndicator(modifier = Modifier.size(12.dp), strokeWidth = 1.5.dp)
            }
        }
    }
    if (search.phase == ListMessageSearchPhase.FAILED) {
        item(key = "message-search-failed", contentType = "message-search-status") {
            Text(
                text = stringResource(R.string.global_search_partial_failure),
                style = MaterialTheme.typography.bodySmall,
                color = MeeshyTheme.tokens.textMuted,
                modifier = Modifier.padding(horizontal = MeeshySpacing.lg, vertical = MeeshySpacing.xs),
            )
        }
    }
    items(search.hits, key = { "message-hit-${it.messageId}" }, contentType = { "message-hit" }) { hit ->
        val shown = hit.asSearchHit(conversationOf(hit.conversationId))
        Row(
            modifier = Modifier.padding(horizontal = MeeshySpacing.lg, vertical = MeeshySpacing.xs),
            horizontalArrangement = Arrangement.Start,
        ) {
            MessageHitRow(
                hit = shown,
                identity = shown.identity(currentUserId),
                resultsQuery = search.query,
                onClick = { onOpen(hit) },
            )
        }
    }
}

/** La ligne de la recherche globale sait rendre un [MessageSearchHit] : la section la réutilise telle quelle. */
internal fun ListMessageHit.asSearchHit(conversation: ApiConversation?): MessageSearchHit = MessageSearchHit(
    message = ApiMessage(
        id = messageId,
        conversationId = conversationId,
        content = text,
        createdAt = Instant.ofEpochMilli(createdAtMillis).toString(),
        sender = senderName.takeIf { it.isNotBlank() }?.let { ApiMessageSender(displayName = it) },
    ),
    conversationTitle = conversationTitle.ifBlank { conversation?.title.orEmpty() },
    conversation = conversation,
    conversationAvatar = conversationAvatar,
    isVeiled = isVeiled,
    transcriptMedia = transcriptMedia,
)
