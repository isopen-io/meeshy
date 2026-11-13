package me.meeshy.app.conversations

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import me.meeshy.feature.conversations.R
import me.meeshy.sdk.conversation.LocalMessage
import me.meeshy.sdk.model.MeeshyUser
import me.meeshy.ui.icons.MeeshyIcons
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme

/** Le nombre de lignes qu'un message occupe au plus dans la carte : assez pour LIRE, pas un fil complet. */
private const val PEEK_LINE_MAX_LINES = 4

/**
 * La carte d'appui long, réduite à son CONTENU (aucun en-tête : on sait déjà ce qu'on a pressé) : les derniers messages, le plus récent EN BAS et ancré au bas de la carte — quand
 * la carte se réduit, ce sont les plus anciens qui sortent du cadre. Chaque ligne passe par [previewLines]
 * (Prisme du lecteur, libellés de protection) : jamais une seconde mise en forme.
 */
@Composable
internal fun ConversationPeekCardBody(
    messages: List<LocalMessage>?,
    isUnavailable: Boolean,
    isSealed: Boolean,
    showSender: Boolean,
    currentUserId: String?,
    currentUserPrefs: MeeshyUser?,
    labels: LastMessagePreviewLabels,
) {
    val tokens = MeeshyTheme.tokens
    val note: String? = when {
        isSealed -> null
        messages == null && isUnavailable -> stringResource(R.string.preview_messages_unavailable)
        messages == null -> stringResource(R.string.conversations_preview_loading)
        messages.isEmpty() -> stringResource(R.string.conversations_no_messages)
        else -> null
    }
    Box(Modifier.fillMaxSize(), contentAlignment = Alignment.BottomStart) {
        when {
            isSealed -> Row(
                modifier = Modifier.padding(MeeshySpacing.lg),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Icon(
                    imageVector = MeeshyIcons.LockFilled,
                    contentDescription = null,
                    tint = tokens.textMuted,
                    modifier = Modifier.padding(end = MeeshySpacing.xs).size(16.dp),
                )
                Text(
                    text = stringResource(R.string.conversations_lock_title_open),
                    style = MaterialTheme.typography.bodyMedium,
                    color = tokens.textMuted,
                )
            }
            note != null -> Text(
                text = note,
                style = MaterialTheme.typography.bodyMedium,
                color = tokens.textMuted,
                modifier = Modifier.padding(MeeshySpacing.lg),
            )
            else -> {
                val lines = remember(messages, currentUserId, showSender, currentUserPrefs, labels) {
                    previewLines(
                        recent = messages.orEmpty(),
                        currentUserId = currentUserId,
                        showSender = showSender,
                        prefs = currentUserPrefs,
                        labels = labels,
                    ).asReversed()
                }
                LazyColumn(
                    modifier = Modifier.fillMaxSize(),
                    reverseLayout = true,
                    userScrollEnabled = false,
                    contentPadding = PaddingValues(horizontal = MeeshySpacing.lg, vertical = MeeshySpacing.md),
                    verticalArrangement = Arrangement.spacedBy(MeeshySpacing.sm, Alignment.Bottom),
                ) {
                    itemsIndexed(lines) { _, line ->
                        Text(
                            text = line,
                            style = MaterialTheme.typography.bodyMedium,
                            color = tokens.textSecondary,
                            maxLines = PEEK_LINE_MAX_LINES,
                            overflow = TextOverflow.Ellipsis,
                        )
                    }
                }
            }
        }
    }
}
