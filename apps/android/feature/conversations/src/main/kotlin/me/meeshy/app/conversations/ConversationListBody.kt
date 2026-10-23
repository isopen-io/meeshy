package me.meeshy.app.conversations

import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyListState
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.Chat
import androidx.compose.material.icons.filled.Folder
import androidx.compose.material.icons.filled.PushPin
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import me.meeshy.feature.conversations.R
import me.meeshy.sdk.model.ApiConversation
import me.meeshy.sdk.model.conversationlist.SectionFoldedUnread
import me.meeshy.ui.component.CollapsibleSection
import me.meeshy.ui.theme.MeeshyPalette

/** The populated list: pull-to-refresh over the pinned / category / all sections. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
internal fun ConversationListBody(
    state: ConversationListUiState,
    listState: LazyListState,
    viewModel: ConversationListViewModel,
) {
    PullToRefreshBox(
        isRefreshing = state.isUserRefreshing,
        onRefresh = viewModel::refresh,
        modifier = Modifier.fillMaxSize(),
    ) {
        // Sections (parity iOS): Épingles first, then Mes conversations. The split is the
        // pure ConversationSections SSOT, which also omits an empty section. Section bodies
        // compose eagerly (few items on a real account).
        val sections = ConversationSections.of(state.conversations, state.categories)
        val nowMillis by rememberMinuteClock()
        LazyColumn(state = listState, modifier = Modifier.fillMaxSize()) {
            if (!ConversationSections.showsHeaders(sections)) {
                sections.forEach { section ->
                    items(section.items, key = { "row-${it.id}" }) { conversation ->
                        ConversationListRow(state, conversation, viewModel, nowMillis)
                    }
                }
                return@LazyColumn
            }
            sections.forEach { section ->
                val key = section.categoryId?.let { "section-cat-$it" } ?: "section-${section.kind}"
                item(key = key) {
                    CollapsibleSection(
                        title = section.title ?: stringResource(section.kind.titleRes()),
                        count = section.items.size,
                        foldedUnread = SectionFoldedUnread.count(section.items.map { it.unreadCount }, isExpanded = false),
                        iconContainerColor = section.kind.containerColor(),
                        icon = {
                            Icon(
                                section.kind.icon(),
                                contentDescription = null,
                                tint = MeeshyPalette.White,
                                modifier = Modifier.size(16.dp),
                            )
                        },
                    ) {
                        section.items.forEach { conversation ->
                            ConversationListRow(state, conversation, viewModel, nowMillis)
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun ConversationListRow(
    state: ConversationListUiState,
    conversation: ApiConversation,
    viewModel: ConversationListViewModel,
    now: Long,
) {
    val actions = remember(viewModel, conversation.id) {
        ConversationRowActions.forConversation(viewModel, conversation.id)
    }
    ConversationRow(
        model = ConversationRowModel(
            conversation = conversation,
            currentUserId = state.currentUserId,
            currentUserPrefs = state.currentUser,
            presence = state.presenceStateFor(conversation, now),
            storyRing = state.storyRingFor(conversation, now),
            moodEmoji = state.moodEmojiFor(conversation),
            draft = state.draftFor(conversation.id),
            typingDisplayName = state.typingDisplayNameFor(conversation.id),
            categories = state.categories,
            previewMessages = state.previewFor(conversation.id),
            isLocked = state.isLocked(conversation.id),
            nowMillis = now,
        ),
        actions = actions,
    )
}

private fun ConversationSectionKind.titleRes(): Int = when (this) {
    ConversationSectionKind.PINNED -> R.string.conversations_section_pinned
    // CATEGORY headers render the category's own name (section.title); this
    // resource is only the exhaustive-`when` fallback and is never shown.
    ConversationSectionKind.CATEGORY -> R.string.conversations_section_all
    ConversationSectionKind.ALL -> R.string.conversations_section_all
}

private fun ConversationSectionKind.icon() = when (this) {
    ConversationSectionKind.PINNED -> Icons.Filled.PushPin
    ConversationSectionKind.CATEGORY -> Icons.Filled.Folder
    ConversationSectionKind.ALL -> Icons.AutoMirrored.Filled.Chat
}

private fun ConversationSectionKind.containerColor(): Color = when (this) {
    ConversationSectionKind.PINNED -> MeeshyPalette.Error
    ConversationSectionKind.CATEGORY -> MeeshyPalette.Indigo500
    ConversationSectionKind.ALL -> MeeshyPalette.Indigo500
}
