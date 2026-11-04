package me.meeshy.app.conversations

import androidx.compose.animation.core.FiniteAnimationSpec
import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyListScope
import androidx.compose.foundation.lazy.LazyListState
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.runtime.remember
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.delay
import me.meeshy.ui.theme.LentilleMetrics
import me.meeshy.sdk.model.ApiConversation
import me.meeshy.sdk.model.conversationlist.SectionFoldedUnread
import me.meeshy.sdk.model.renderFingerprint
import me.meeshy.sdk.model.search.ListMessageHit
import me.meeshy.sdk.model.search.ListMessageSearchState
import me.meeshy.sdk.theme.otherParticipantUserId
import me.meeshy.ui.haptics.rememberMeeshyHaptics
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
        val stickerSkin = rememberLentilleListSkin()
        val placementSpec = rememberBumpPlacementSpec(state.conversations.map { it.id }, listState)
        var enteringSection by remember { mutableStateOf<String?>(null) }
        LaunchedEffect(enteringSection) {
            if (enteringSection != null) {
                delay(ENTRY_WINDOW_MILLIS)
                enteringSection = null
            }
        }
        LazyColumn(state = listState, modifier = Modifier.fillMaxSize().testTag(CONVERSATION_LIST_TAG)) {
            item(key = "list-story-rail", contentType = "story-rail") { header() }
            conversationListStateItems(
                content = content,
                onRetry = viewModel::refresh,
                onNewConversation = onNewConversation,
            ) {
                populatedItems(
                    state, sections, expandedSections, viewModel, nowMillis, signals, rowNavigation, tailHeight,
                    placementSpec, stickerSkin, enteringSection,
                    onSectionToggled = { section, expand ->
                        if (expand) enteringSection = section.sectionId
                        viewModel.onSectionToggled(section, expand)
                    },
                ) {
                    messageSearchItems(messageSearch, state.currentUserId, viewModel::conversationFor, onOpenMessage)
                }
            }
        }
    }
}

@OptIn(ExperimentalFoundationApi::class)
private fun LazyListScope.populatedItems(
    state: ConversationListUiState,
    sections: List<ConversationSection>,
    expandedSections: Set<String>,
    viewModel: ConversationListViewModel,
    nowMillis: Long,
    signals: ConversationRowSignals,
    rowNavigation: ConversationRowNavigation,
    tailHeight: Dp,
    placementSpec: FiniteAnimationSpec<IntOffset>?,
    stickerSkin: Boolean,
    enteringSection: String?,
    onSectionToggled: (ConversationSection, Boolean) -> Unit,
    messages: LazyListScope.() -> Unit,
) {
    val showsHeaders = ConversationSections.showsHeaders(sections)
    sections.forEachIndexed { index, section ->
        val key = section.categoryId?.let { "section-cat-$it" } ?: "section-${section.kind}"
        val expanded = !showsHeaders || section.sectionId in expandedSections
        if (showsHeaders) {
            if (index > 0) item(key = "gap-$key", contentType = "section-gap") { Spacer(Modifier.height(SECTION_SPACING)) }
            stickyHeader(key = key, contentType = "section-header") {
                val foldedUnread = SectionFoldedUnread.count(section.items.map { it.unreadCount }, isExpanded = false)
                ConversationSectionHeader(
                    section = section,
                    expanded = expanded,
                    foldedUnread = foldedUnread,
                    stickerSkin = stickerSkin,
                    onToggle = { onSectionToggled(section, it) },
                )
            }
        }
        if (expanded) {
            items(section.items, key = { it.id }, contentType = { ROW_CONTENT_TYPE }) { conversation ->
                Box(
                    Modifier
                        .animateItem(placementSpec = placementSpec)
                        .sectionRowEntry(animate = section.sectionId == enteringSection),
                ) {
                    ConversationListRow(state, conversation, viewModel, nowMillis, signals, rowNavigation)
                }
            }
        }
    }
    messages()
    item(key = "list-tail", contentType = "tail") { Spacer(Modifier.height(tailHeight)) }
}

/** Espace entre deux sections (iOS `LentilleMetrics` : 8 pt entre sections). */
private val SECTION_SPACING = LentilleMetrics.Row.marginVertical

/** Marge de fin de liste (iOS `Color.clear.frame(height: 60)`) : les disques flottants ne réservent rien, comme iOS (#13671). */
private val LIST_TAIL_HEIGHT = 60.dp

private const val ENTRY_WINDOW_MILLIS = 600L

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
