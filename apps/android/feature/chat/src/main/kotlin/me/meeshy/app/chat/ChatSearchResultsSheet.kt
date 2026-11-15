package me.meeshy.app.chat

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.remember
import androidx.compose.runtime.snapshotFlow
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import java.time.ZoneId
import java.util.Locale
import me.meeshy.feature.chat.R
import me.meeshy.sdk.model.MessageTextParser
import me.meeshy.sdk.model.isoToEpochMillisOrNull
import me.meeshy.sdk.model.search.ConversationSearchResult
import me.meeshy.sdk.model.search.SearchMatchType
import me.meeshy.ui.component.MeeshyAvatar
import me.meeshy.ui.component.VeiledTextBars
import me.meeshy.ui.format.RelativeTimeFormat
import me.meeshy.ui.format.rememberRelativeTimeStrings
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme

private val PANEL_MAX_HEIGHT = 360.dp
private val RESULT_AVATAR_SIZE = 36.dp
private const val LOAD_MORE_THRESHOLD = 3
private const val MATCH_WASH_ALPHA = 0.3f

/** Le texte correspondant, avec chaque occurrence de [term] surlignée (insensible à la casse et aux accents). */
internal fun highlightedMatch(text: String, term: String?, wash: Color): AnnotatedString =
    buildAnnotatedString {
        MessageTextParser.highlightedSegments(text, term.orEmpty()).forEach { segment ->
            if (segment.highlighted) {
                withStyle(SpanStyle(background = wash, fontWeight = FontWeight.SemiBold)) { append(segment.text) }
            } else {
                append(segment.text)
            }
        }
    }

/**
 * Les résultats de la recherche serveur, sous la barre de recherche : un indicateur pendant la recherche,
 * « aucun résultat », l'échec avec « Réessayer », la note hors ligne ; la suite se charge au défilement.
 */
@Composable
internal fun ChatSearchResultsSheet(
    state: ChatServerSearchState,
    accentColor: Color,
    onSelect: (String) -> Unit,
    onLoadMore: () -> Unit,
    onRetry: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val tokens = MeeshyTheme.tokens
    val listState = rememberLazyListState()
    LaunchedEffect(listState, state.results.size) {
        snapshotFlow { listState.layoutInfo.visibleItemsInfo.lastOrNull()?.index ?: -1 }
            .collect { last -> if (last >= state.results.size - LOAD_MORE_THRESHOLD) onLoadMore() }
    }
    Column(modifier.fillMaxWidth().heightIn(max = PANEL_MAX_HEIGHT)) {
        if (state.isOffline) {
            Text(
                text = stringResource(R.string.chat_search_offline),
                style = MaterialTheme.typography.labelMedium,
                color = tokens.textSecondary,
                modifier = Modifier.padding(horizontal = MeeshySpacing.lg, vertical = MeeshySpacing.sm),
            )
        }
        when {
            state.failed -> Row(
                Modifier.fillMaxWidth().padding(horizontal = MeeshySpacing.lg),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.SpaceBetween,
            ) {
                Text(stringResource(R.string.chat_search_failed), color = tokens.textSecondary)
                TextButton(onClick = onRetry) { Text(stringResource(R.string.chat_search_retry), color = accentColor) }
            }
            state.isSearching && state.results.isEmpty() -> Box(Modifier.fillMaxWidth().padding(MeeshySpacing.lg), Alignment.Center) {
                CircularProgressIndicator(Modifier.size(RESULT_AVATAR_SIZE / 2), color = accentColor, strokeWidth = 2.dp)
            }
            state.showsEmpty -> Text(
                text = stringResource(R.string.chat_search_no_results),
                color = tokens.textSecondary,
                modifier = Modifier.padding(horizontal = MeeshySpacing.lg, vertical = MeeshySpacing.md),
            )
            else -> LazyColumn(state = listState) {
                items(state.results, key = ConversationSearchResult::id, contentType = { it.matchType }) { result ->
                    ChatSearchResultRow(result, state.query, accentColor) { onSelect(result.id) }
                }
                if (state.isSearching) {
                    item(key = "loading", contentType = "loading") {
                        Box(Modifier.fillMaxWidth().padding(MeeshySpacing.md), Alignment.Center) {
                            CircularProgressIndicator(Modifier.size(RESULT_AVATAR_SIZE / 2), color = accentColor, strokeWidth = 2.dp)
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun ChatSearchResultRow(
    result: ConversationSearchResult,
    query: String?,
    accentColor: Color,
    onClick: () -> Unit,
) {
    val tokens = MeeshyTheme.tokens
    val strings = rememberRelativeTimeStrings()
    val wash = accentColor.copy(alpha = MATCH_WASH_ALPHA)
    val whenLabel = remember(result.createdAtIso, strings) {
        isoToEpochMillisOrNull(result.createdAtIso)?.let {
            RelativeTimeFormat.short(it, System.currentTimeMillis(), ZoneId.systemDefault(), Locale.getDefault(), strings)
        }.orEmpty()
    }
    val description = stringResource(R.string.chat_search_open_result, result.senderName)
    val translationBadge = stringResource(R.string.chat_search_translation_badge)
    val isTranslation = result.matchType == SearchMatchType.TRANSLATION
    val spokenText = if (result.isVeiled) stringResource(R.string.chat_search_message_blurred) else result.matchedText
    // iOS `MessageSearchResultRow.accessibilityLabel` : l'auteur, le texte trouvé et l'heure — plus, ici, le drapeau de traduction.
    val spokenMatch = listOfNotNull(translationBadge.takeIf { isTranslation }, spokenText, whenLabel.ifBlank { null }).joinToString(", ")
    Row(
        Modifier
            .fillMaxWidth()
            .clickable(onClick = onClick)
            .semantics(mergeDescendants = true) { contentDescription = description }
            .padding(horizontal = MeeshySpacing.lg, vertical = MeeshySpacing.sm),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.md),
    ) {
        MeeshyAvatar(name = result.senderName, size = RESULT_AVATAR_SIZE, containerColor = accentColor, imageUrl = result.senderAvatar)
        Column(Modifier.weight(1f).clearAndSetSemantics { contentDescription = spokenMatch }) {
            Row(horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.sm), verticalAlignment = Alignment.CenterVertically) {
                Text(result.senderName, style = MaterialTheme.typography.labelLarge, color = tokens.textPrimary, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f, fill = false))
                Text(whenLabel, style = MaterialTheme.typography.labelSmall, color = tokens.textMuted)
            }
            if (isTranslation) {
                Text(translationBadge, style = MaterialTheme.typography.labelSmall, color = accentColor)
            }
            if (result.isVeiled) {
                VeiledTextBars(tint = tokens.textMuted)
            } else {
                Text(
                    text = highlightedMatch(result.matchedText, query, wash),
                    style = MaterialTheme.typography.bodyMedium,
                    color = tokens.textSecondary,
                    maxLines = 2,
                    overflow = TextOverflow.Ellipsis,
                )
            }
        }
    }
}
