package me.meeshy.app.conversations

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.History
import androidx.compose.material.icons.filled.Search
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import me.meeshy.feature.conversations.R
import me.meeshy.sdk.model.ApiConversation
import me.meeshy.sdk.model.MessageTextParser
import me.meeshy.sdk.net.api.UserSearchResult
import me.meeshy.sdk.theme.displayTitle
import me.meeshy.sdk.search.MessageSearchHit
import me.meeshy.ui.component.MeeshyAvatar
import me.meeshy.ui.component.chrome.MeeshyBackground
import me.meeshy.ui.component.chrome.MeeshyGlassSurface
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshyRadius
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme

/**
 * Recherche globale plein ecran — parite iOS `GlobalSearchView` : pilule de
 * recherche autofocus, trois onglets (Messages / Conversations / Utilisateurs)
 * avec compteurs, une seule requete pour les trois volets.
 */
@Composable
fun GlobalSearchScreen(
    onBack: () -> Unit,
    onOpenConversation: (String) -> Unit,
    onOpenUser: (String) -> Unit,
    viewModel: GlobalSearchViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    val focusRequester = remember { FocusRequester() }

    LaunchedEffect(Unit) { focusRequester.requestFocus() }

    MeeshyBackground {
        Column(modifier = Modifier.fillMaxSize()) {
            SearchHeader(
                query = state.query,
                onQueryChange = viewModel::setQuery,
                onBack = onBack,
                focusRequester = focusRequester,
            )
            SearchTabRow(
                selected = state.selectedTab,
                countFor = state::countFor,
                onSelect = viewModel::selectTab,
            )
            when {
                state.isSearching -> SearchStatus(
                    label = stringResource(R.string.global_search_searching),
                    showSpinner = true,
                )
                !state.hasSearched && state.recentSearches.isNotEmpty() -> RecentSearchesSection(
                    recents = state.recentSearches,
                    onSelect = viewModel::setQuery,
                    onRemove = viewModel::removeRecentSearch,
                    onClear = viewModel::clearRecentSearches,
                )
                !state.hasSearched -> SearchStatus(
                    label = stringResource(R.string.global_search_empty_title),
                    sublabel = stringResource(R.string.global_search_empty_subtitle),
                )
                state.isCurrentTabEmpty -> SearchStatus(
                    label = stringResource(R.string.global_search_no_results),
                    sublabel = stringResource(R.string.global_search_no_results_hint),
                )
                else -> SearchResults(
                    state = state,
                    onOpenConversation = onOpenConversation,
                    onOpenUser = onOpenUser,
                )
            }
        }
    }
}

@Composable
private fun SearchHeader(
    query: String,
    onQueryChange: (String) -> Unit,
    onBack: () -> Unit,
    focusRequester: FocusRequester,
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = MeeshySpacing.sm, vertical = MeeshySpacing.sm),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        IconButton(onClick = onBack) {
            Icon(
                imageVector = Icons.AutoMirrored.Filled.ArrowBack,
                contentDescription = stringResource(R.string.global_search_back),
                tint = MeeshyTheme.tokens.textPrimary,
            )
        }
        MeeshyGlassSurface(
            shape = RoundedCornerShape(MeeshyRadius.pill),
            modifier = Modifier.weight(1f),
        ) {
            Row(
                modifier = Modifier.padding(horizontal = MeeshySpacing.lg, vertical = MeeshySpacing.md),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Icon(
                    imageVector = Icons.Filled.Search,
                    contentDescription = null,
                    tint = MeeshyPalette.Indigo500,
                    modifier = Modifier.size(20.dp),
                )
                BasicTextField(
                    value = query,
                    onValueChange = onQueryChange,
                    singleLine = true,
                    textStyle = MaterialTheme.typography.bodyMedium.copy(color = MeeshyTheme.tokens.textPrimary),
                    cursorBrush = SolidColor(MeeshyPalette.Indigo500),
                    modifier = Modifier
                        .weight(1f)
                        .padding(start = MeeshySpacing.sm)
                        .focusRequester(focusRequester),
                    decorationBox = { inner ->
                        Box(contentAlignment = Alignment.CenterStart) {
                            if (query.isEmpty()) {
                                Text(
                                    text = stringResource(R.string.global_search_hint),
                                    style = MaterialTheme.typography.bodyMedium,
                                    color = MeeshyTheme.tokens.textMuted,
                                )
                            }
                            inner()
                        }
                    },
                )
            }
        }
        Spacer(Modifier.width(MeeshySpacing.sm))
    }
}

@Composable
private fun SearchTabRow(
    selected: GlobalSearchTab,
    countFor: (GlobalSearchTab) -> Int,
    onSelect: (GlobalSearchTab) -> Unit,
) {
    Row(modifier = Modifier.fillMaxWidth()) {
        GlobalSearchTab.entries.forEach { tab ->
            val isSelected = tab == selected
            val label = when (tab) {
                GlobalSearchTab.MESSAGES -> stringResource(R.string.global_search_tab_messages)
                GlobalSearchTab.CONVERSATIONS -> stringResource(R.string.global_search_tab_conversations)
                GlobalSearchTab.USERS -> stringResource(R.string.global_search_tab_users)
            }
            val count = countFor(tab)
            Column(
                modifier = Modifier
                    .weight(1f)
                    .clickable { onSelect(tab) },
                horizontalAlignment = Alignment.CenterHorizontally,
            ) {
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    modifier = Modifier.padding(vertical = MeeshySpacing.sm),
                ) {
                    Text(
                        text = label,
                        style = MaterialTheme.typography.labelLarge,
                        fontWeight = if (isSelected) FontWeight.Bold else FontWeight.Medium,
                        color = if (isSelected) MeeshyTheme.tokens.textPrimary else MeeshyTheme.tokens.textMuted,
                    )
                    if (count > 0) {
                        Spacer(Modifier.width(MeeshySpacing.xs))
                        Box(
                            modifier = Modifier
                                .clip(CircleShape)
                                .background(MeeshyPalette.Indigo500)
                                .padding(horizontal = 6.dp, vertical = 1.dp),
                        ) {
                            Text(
                                text = if (count > 99) "99+" else count.toString(),
                                style = MaterialTheme.typography.labelSmall,
                                color = MeeshyPalette.White,
                            )
                        }
                    }
                }
                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(2.dp)
                        .background(if (isSelected) MeeshyPalette.Indigo500 else androidx.compose.ui.graphics.Color.Transparent),
                )
            }
        }
    }
}

@Composable
private fun SearchStatus(label: String, sublabel: String? = null, showSpinner: Boolean = false) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .padding(top = 60.dp, start = MeeshySpacing.xl, end = MeeshySpacing.xl),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(MeeshySpacing.md),
    ) {
        if (showSpinner) {
            CircularProgressIndicator(color = MeeshyPalette.Indigo500)
        } else {
            Icon(
                imageVector = Icons.Filled.Search,
                contentDescription = null,
                tint = MeeshyTheme.tokens.textMuted,
                modifier = Modifier.size(44.dp),
            )
        }
        Text(
            text = label,
            style = MaterialTheme.typography.titleMedium,
            color = MeeshyTheme.tokens.textPrimary,
        )
        if (sublabel != null) {
            Text(
                text = sublabel,
                style = MaterialTheme.typography.bodyMedium,
                color = MeeshyTheme.tokens.textMuted,
            )
        }
    }
}

@Composable
private fun SearchResults(
    state: GlobalSearchUiState,
    onOpenConversation: (String) -> Unit,
    onOpenUser: (String) -> Unit,
) {
    LazyColumn(
        modifier = Modifier.fillMaxSize(),
        contentPadding = androidx.compose.foundation.layout.PaddingValues(
            start = MeeshySpacing.lg,
            end = MeeshySpacing.lg,
            top = MeeshySpacing.sm,
            bottom = 120.dp,
        ),
        verticalArrangement = Arrangement.spacedBy(MeeshySpacing.sm),
    ) {
        when (state.selectedTab) {
            GlobalSearchTab.MESSAGES -> items(state.results.messages, key = { it.message.id }) { hit ->
                MessageHitRow(
                    hit = hit,
                    query = state.query,
                    onClick = { onOpenConversation(hit.message.conversationId) },
                )
            }
            GlobalSearchTab.CONVERSATIONS -> items(state.results.conversations, key = { it.id }) { conversation ->
                ConversationHitRow(
                    conversation = conversation,
                    onClick = { onOpenConversation(conversation.id) },
                )
            }
            GlobalSearchTab.USERS -> items(state.results.users, key = { it.id }) { user ->
                UserHitRow(user = user, onClick = { onOpenUser(user.id) })
            }
        }
    }
}

@Composable
private fun ResultCard(onClick: () -> Unit, content: @Composable androidx.compose.foundation.layout.RowScope.() -> Unit) {
    MeeshyGlassSurface(
        shape = RoundedCornerShape(MeeshyRadius.lg),
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(MeeshyRadius.lg))
            .clickable(onClick = onClick),
    ) {
        Row(
            modifier = Modifier.padding(MeeshySpacing.md),
            verticalAlignment = Alignment.CenterVertically,
        ) { content() }
    }
}

@Composable
private fun MessageHitRow(hit: MessageSearchHit, query: String, onClick: () -> Unit) {
    ResultCard(onClick = onClick) {
        MeeshyAvatar(name = hit.conversationTitle, size = 40.dp)
        Spacer(Modifier.width(MeeshySpacing.md))
        Column(modifier = Modifier.weight(1f)) {
            Text(
                text = hit.conversationTitle.ifBlank { hit.message.sender?.displayName ?: "" },
                style = MaterialTheme.typography.titleSmall,
                color = MeeshyTheme.tokens.textPrimary,
                maxLines = 1,
            )
            val sender = hit.message.sender?.displayName ?: hit.message.sender?.username
            if (!sender.isNullOrBlank()) {
                Text(
                    text = sender,
                    style = MaterialTheme.typography.labelMedium,
                    color = MeeshyPalette.Indigo500,
                    maxLines = 1,
                )
            }
            val highlighted = remember(hit.message.content, query) {
                buildHighlightedContent(hit.message.content, query, SEARCH_HIGHLIGHT_WASH)
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

/**
 * Pure mapping glue — the accent- and case-insensitive match decision lives in
 * [MessageTextParser.highlightedSegments] (unit-tested SSOT); this only washes the
 * highlighted runs with [wash]. Same wash as the chat bubble's search highlight so
 * a term reads the same in the result row and in the opened conversation.
 */
private fun buildHighlightedContent(content: String, query: String, wash: Color): AnnotatedString =
    buildAnnotatedString {
        MessageTextParser.highlightedSegments(content, query).forEach { segment ->
            if (segment.highlighted) {
                withStyle(SpanStyle(background = wash)) { append(segment.text) }
            } else {
                append(segment.text)
            }
        }
    }

private val SEARCH_HIGHLIGHT_WASH = MeeshyPalette.Warning.copy(alpha = 0.45f)

@Composable
private fun ConversationHitRow(conversation: ApiConversation, onClick: () -> Unit) {
    val title = conversation.displayTitle()
    ResultCard(onClick = onClick) {
        MeeshyAvatar(name = title, size = 40.dp)
        Spacer(Modifier.width(MeeshySpacing.md))
        Column(modifier = Modifier.weight(1f)) {
            Text(
                text = title,
                style = MaterialTheme.typography.titleSmall,
                color = MeeshyTheme.tokens.textPrimary,
                maxLines = 1,
            )
            if (conversation.memberCount > 2) {
                Text(
                    text = stringResource(R.string.global_search_members, conversation.memberCount),
                    style = MaterialTheme.typography.bodySmall,
                    color = MeeshyTheme.tokens.textMuted,
                    maxLines = 1,
                )
            }
        }
        if (conversation.unreadCount > 0) {
            Box(
                modifier = Modifier
                    .clip(CircleShape)
                    .background(MeeshyPalette.Error)
                    .padding(horizontal = 7.dp, vertical = 2.dp),
            ) {
                Text(
                    text = conversation.unreadCount.toString(),
                    style = MaterialTheme.typography.labelSmall,
                    color = MeeshyPalette.White,
                )
            }
        }
    }
}

@Composable
private fun UserHitRow(user: UserSearchResult, onClick: () -> Unit) {
    ResultCard(onClick = onClick) {
        MeeshyAvatar(name = user.displayName ?: user.username, size = 40.dp)
        Spacer(Modifier.width(MeeshySpacing.md))
        Column(modifier = Modifier.weight(1f)) {
            Text(
                text = user.displayName ?: user.username,
                style = MaterialTheme.typography.titleSmall,
                color = MeeshyTheme.tokens.textPrimary,
                maxLines = 1,
            )
            Text(
                text = "@${user.username}",
                style = MaterialTheme.typography.bodySmall,
                color = MeeshyTheme.tokens.textMuted,
                maxLines = 1,
            )
        }
        if (user.isOnline == true) {
            Text(
                text = stringResource(R.string.global_search_online),
                style = MaterialTheme.typography.labelSmall,
                color = MeeshyPalette.Success,
            )
        }
    }
}

/** Section « Recherches recentes » (parite iOS) : tap = relance, croix = oubli. */
@Composable
private fun RecentSearchesSection(
    recents: List<String>,
    onSelect: (String) -> Unit,
    onRemove: (String) -> Unit,
    onClear: () -> Unit,
) {
    LazyColumn(
        modifier = Modifier.fillMaxSize(),
        contentPadding = androidx.compose.foundation.layout.PaddingValues(
            start = MeeshySpacing.lg,
            end = MeeshySpacing.lg,
            top = MeeshySpacing.sm,
            bottom = 120.dp,
        ),
        verticalArrangement = Arrangement.spacedBy(MeeshySpacing.sm),
    ) {
        item(key = "recent_header") {
            Row(
                verticalAlignment = Alignment.CenterVertically,
                modifier = Modifier.fillMaxWidth(),
            ) {
                Icon(
                    imageVector = Icons.Filled.History,
                    contentDescription = null,
                    tint = MeeshyPalette.Indigo500,
                    modifier = Modifier.size(18.dp),
                )
                Spacer(Modifier.width(MeeshySpacing.sm))
                Text(
                    text = stringResource(R.string.global_search_recent_title),
                    style = MaterialTheme.typography.titleSmall,
                    color = MeeshyTheme.tokens.textPrimary,
                    modifier = Modifier.weight(1f),
                )
                Text(
                    text = stringResource(R.string.global_search_recent_clear),
                    style = MaterialTheme.typography.labelLarge,
                    color = MeeshyPalette.Error,
                    modifier = Modifier
                        .clip(RoundedCornerShape(MeeshyRadius.pill))
                        .clickable(onClick = onClear)
                        .padding(horizontal = MeeshySpacing.sm, vertical = MeeshySpacing.xs),
                )
            }
        }
        items(recents, key = { it }) { query ->
            ResultCard(onClick = { onSelect(query) }) {
                Icon(
                    imageVector = Icons.Filled.History,
                    contentDescription = null,
                    tint = MeeshyTheme.tokens.textMuted,
                    modifier = Modifier.size(18.dp),
                )
                Spacer(Modifier.width(MeeshySpacing.md))
                Text(
                    text = query,
                    style = MaterialTheme.typography.bodyLarge,
                    color = MeeshyTheme.tokens.textPrimary,
                    maxLines = 1,
                    modifier = Modifier.weight(1f),
                )
                IconButton(onClick = { onRemove(query) }, modifier = Modifier.size(28.dp)) {
                    Icon(
                        imageVector = Icons.Filled.Close,
                        contentDescription = stringResource(R.string.global_search_recent_remove),
                        tint = MeeshyTheme.tokens.textMuted,
                        modifier = Modifier.size(16.dp),
                    )
                }
            }
        }
    }
}
