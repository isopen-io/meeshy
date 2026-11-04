package me.meeshy.app.conversations

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyListScope
import androidx.compose.foundation.lazy.LazyListState
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.Chat
import androidx.compose.material.icons.filled.PushPin
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.pluralStringResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import me.meeshy.feature.conversations.R
import me.meeshy.sdk.model.ApiConversation
import me.meeshy.sdk.model.conversationlist.SectionFoldedUnread
import me.meeshy.sdk.model.renderFingerprint
import me.meeshy.sdk.model.search.ListMessageHit
import me.meeshy.sdk.model.search.ListMessageSearchState
import me.meeshy.sdk.theme.otherParticipantUserId
import me.meeshy.ui.component.CollapsibleSection
import kotlinx.coroutines.flow.first
import me.meeshy.ui.component.refresh.MeeshyRefreshableBox
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.hexColor

internal const val CONVERSATION_LIST_TAG = "conversation-list"

/** La liste : tirer pour rafraîchir sur la tête (rail + filtres) puis, selon [content], le squelette, la carte d'état ou les sections épinglés / catégories / toutes. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
internal fun ConversationListBody(
    state: ConversationListUiState,
    listState: LazyListState,
    viewModel: ConversationListViewModel,
    content: ConversationListContent,
    onNewConversation: () -> Unit = {},
    onRefresh: () -> Unit = {},
    rowNavigation: ConversationRowNavigation = ConversationRowNavigation.None,
    header: @Composable () -> Unit = {},
    messageSearch: ListMessageSearchState = ListMessageSearchState.Idle,
    onOpenMessage: (ListMessageHit) -> Unit = {},
) {
    val signals by viewModel.rowSignals.collectAsStateWithLifecycle()
    MeeshyRefreshableBox(
        onRefresh = {
            viewModel.refresh()
            onRefresh()
            viewModel.state.first { !it.isUserRefreshing }
        },
        modifier = Modifier.fillMaxSize(),
    ) {
        // Sections (parity iOS): Épingles first, then Mes conversations. The split is the
        // pure ConversationSections SSOT, which also omits an empty section. Section bodies
        // compose eagerly (few items on a real account).
        val sections = ConversationSections.of(state.conversations, state.categories)
        val remembered by viewModel.rememberedSections.collectAsStateWithLifecycle()
        val expandedSections = ConversationSectionExpansionStore.effective(remembered, state.categories)
        val nowMillis by rememberMinuteClock()
        val tailHeight = LIST_TAIL_HEIGHT
        LazyColumn(state = listState, modifier = Modifier.fillMaxSize().testTag(CONVERSATION_LIST_TAG)) {
            item(key = "list-story-rail", contentType = "story-rail") { header() }
            conversationListStateItems(
                content = content,
                onRetry = viewModel::refresh,
                onNewConversation = onNewConversation,
            ) {
                populatedItems(state, sections, expandedSections, viewModel, nowMillis, signals, rowNavigation, tailHeight) {
                    messageSearchItems(messageSearch, state.currentUserId, viewModel::conversationFor, onOpenMessage)
                }
            }
        }
    }
}

private fun LazyListScope.populatedItems(
    state: ConversationListUiState,
    sections: List<ConversationSection>,
    expandedSections: Set<String>,
    viewModel: ConversationListViewModel,
    nowMillis: Long,
    signals: ConversationRowSignals,
    rowNavigation: ConversationRowNavigation,
    tailHeight: Dp,
    messages: LazyListScope.() -> Unit,
) {
    if (!ConversationSections.showsHeaders(sections)) {
        sections.forEach { section ->
            items(section.items, key = { "row-${it.id}" }, contentType = { ROW_CONTENT_TYPE }) { conversation ->
                Box(Modifier.animateItem()) {
                    ConversationListRow(state, conversation, viewModel, nowMillis, signals, rowNavigation)
                }
            }
        }
        messages()
        item(key = "list-tail", contentType = "tail") { Spacer(Modifier.height(tailHeight)) }
        return
    }
    sections.forEach { section ->
        val key = section.categoryId?.let { "section-cat-$it" } ?: "section-${section.kind}"
        item(key = key, contentType = "section-header") {
            val expanded = section.sectionId in expandedSections
            val foldedUnread = SectionFoldedUnread.count(section.items.map { it.unreadCount }, isExpanded = false)
            CollapsibleSection(
                title = section.title ?: stringResource(section.kind.titleRes()),
                count = section.items.size,
                foldedUnread = foldedUnread,
                foldedUnreadDescription = foldedUnread.takeIf { it > 0 }?.let {
                    pluralStringResource(R.plurals.row_a11y_unread_count, it, it)
                },
                iconContainerColor = section.containerColor(),
                expanded = expanded,
                onExpandedChange = { viewModel.onSectionToggled(section, it) },
                stateDescription = sectionStateDescription(expanded, foldedUnread),
                icon = {
                    Icon(
                        section.glyph(),
                        contentDescription = null,
                        tint = MeeshyPalette.White,
                        modifier = Modifier.size(16.dp),
                    )
                },
            ) {
                section.items.forEach { conversation ->
                    ConversationListRow(state, conversation, viewModel, nowMillis, signals, rowNavigation)
                }
            }
        }
    }
    messages()
    item(key = "list-tail", contentType = "tail") { Spacer(Modifier.height(tailHeight)) }
}

/** Marge de fin de liste (iOS `Color.clear.frame(height: 60)`) : les disques flottants ne réservent rien, comme iOS (#13671). */
private val LIST_TAIL_HEIGHT = 60.dp

private const val ROW_CONTENT_TYPE = "conversation-row"

@Composable
private fun ConversationListRow(
    state: ConversationListUiState,
    conversation: ApiConversation,
    viewModel: ConversationListViewModel,
    now: Long,
    signals: ConversationRowSignals,
    rowNavigation: ConversationRowNavigation,
) {
    val currentUserId = state.currentUserId
    val actions = remember(viewModel, conversation, currentUserId, rowNavigation) {
        ConversationRowActions.forConversation(viewModel, conversation.id)
            .withNavigation(rowNavigation, conversation, currentUserId)
    }
    val fingerprint = conversation.renderFingerprint()
    val stableConversation = remember(conversation.id, fingerprint) { conversation }
    ConversationRow(
        model = ConversationRowModel(
            conversation = stableConversation,
            currentUserId = state.currentUserId,
            currentUserPrefs = state.currentUser,
            peerUserId = conversation.otherParticipantUserId(currentUserId),
            storyRing = state.storyRingFor(conversation, now),
            moodEmoji = state.moodEmojiFor(conversation),
            draft = state.draftFor(conversation.id),
            typingDisplayName = state.typingDisplayNameFor(conversation.id),
            categories = state.categories,
            previewMessages = state.previewFor(conversation.id),
            previewUnavailable = state.isPreviewUnavailable(conversation.id),
            isLocked = state.isLocked(conversation.id),
            nowMillis = now,
            hasPendingSync = signals.hasPendingSync(conversation.id),
            here = signals.peerHere(conversation, currentUserId).toAvatarHere(),
            callInProgress = signals.hasCallInProgress(conversation.id),
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

private fun ConversationSection.glyph() = when (kind) {
    ConversationSectionKind.PINNED -> Icons.Filled.PushPin
    ConversationSectionKind.CATEGORY -> categoryIconFor(icon)
    ConversationSectionKind.ALL -> Icons.AutoMirrored.Filled.Chat
}

/** La couleur de la pastille : celle de la catégorie quand elle en a une, sinon la teinte du genre. */
@Composable
private fun ConversationSection.containerColor(): Color = when (kind) {
    ConversationSectionKind.PINNED -> MeeshyPalette.Error
    ConversationSectionKind.CATEGORY -> color?.let { hexColor(it, MeeshyPalette.Indigo500) } ?: MeeshyPalette.Indigo500
    ConversationSectionKind.ALL -> MeeshyPalette.Indigo500
}

/** La valeur TalkBack de l'en-tête (iOS `SectionFoldedUnread.accessibilityValue`) : « Développée » ou « Réduite, N non lus ». */
@Composable
private fun sectionStateDescription(expanded: Boolean, foldedUnread: Int): String {
    if (expanded) return stringResource(R.string.links_section_expanded)
    val state = stringResource(R.string.links_section_collapsed)
    if (foldedUnread <= 0) return state
    return "$state, ${pluralStringResource(R.plurals.row_a11y_unread_count, foldedUnread, foldedUnread)}"
}
