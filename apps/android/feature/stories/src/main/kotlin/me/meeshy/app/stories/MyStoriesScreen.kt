package me.meeshy.app.stories

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import me.meeshy.feature.stories.R
import me.meeshy.sdk.model.MyStoriesTab
import me.meeshy.sdk.model.MyStoryCardRules
import me.meeshy.sdk.model.MyStoryDeleteConfirmation
import me.meeshy.sdk.model.fromStory
import me.meeshy.ui.component.chrome.MeeshyBackground
import me.meeshy.ui.haptics.rememberMeeshyHaptics
import me.meeshy.ui.theme.hexColor

/**
 * « Mes stories » (iOS `MyStoriesView`) : quatre onglets distincts — Publiées, File, Brouillons, Archive — dans un
 * sélecteur segmenté (jamais un pager horizontal, qui entrerait en conflit avec le geste de fermeture de la feuille).
 * Cache-first (l'archive en cache peint tout de suite), squelette seulement à froid, suppression optimiste avec
 * retour arrière, sélection multiple avec suppression groupée confirmée.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun MyStoriesScreen(
    onBack: () -> Unit,
    onCreateStory: () -> Unit,
    onOpenStory: (String) -> Unit,
    /** « Modifier » : rouvre la story publiée dans le composeur (#13632). */
    onEditStory: (String) -> Unit = {},
    /** Reprend le brouillon du composeur (le composeur restaure son emplacement unique). */
    onResumeDraft: () -> Unit = {},
    viewModel: MyStoriesViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    val snackbar = remember { SnackbarHostState() }
    val haptics = rememberMeeshyHaptics()
    var viewersStoryId by remember { mutableStateOf<String?>(null) }
    val messages = EffectMessages(
        deleted = stringResource(R.string.my_stories_delete_success),
        deleteFailed = stringResource(R.string.my_stories_delete_error),
        bulkDeleted = stringResource(R.string.my_stories_delete_selected_success),
        republished = stringResource(R.string.my_stories_repost_success),
        republishFailed = stringResource(R.string.my_stories_repost_error),
        resumeFailed = stringResource(R.string.my_stories_resume_failed),
        draftOpenFailed = stringResource(R.string.my_stories_draft_open_failed),
    )
    val context = LocalContext.current
    val onResumeDraftState = rememberUpdatedState(onResumeDraft)
    val bulkFailedFormat = stringResource(R.string.my_stories_delete_selected_error, 0)

    LaunchedEffect(viewModel) {
        viewModel.effects.collect { effect ->
            val message = when (effect) {
                MyStoriesUiEffect.StoryDeleted -> messages.deleted.also { haptics.success() }
                MyStoriesUiEffect.DeleteFailed -> messages.deleteFailed.also { haptics.error() }
                MyStoriesUiEffect.BulkDeleted -> messages.bulkDeleted.also { haptics.success() }
                is MyStoriesUiEffect.BulkDeleteFailed ->
                    bulkFailedFormat.replaceFirst("0", effect.failures.toString()).also { haptics.error() }
                MyStoriesUiEffect.Republished -> messages.republished.also { haptics.success() }
                MyStoriesUiEffect.RepublishFailed -> messages.republishFailed.also { haptics.error() }
                MyStoriesUiEffect.DraftReady -> {
                    onResumeDraftState.value()
                    return@collect
                }
                MyStoriesUiEffect.ResumeFailed -> messages.resumeFailed.also { haptics.error() }
                MyStoriesUiEffect.DraftOpenFailed -> messages.draftOpenFailed.also { haptics.error() }
                is MyStoriesUiEffect.RepublishRefusedAudienceKept ->
                    context.getString(R.string.my_stories_repost_audience_kept, context.getString(effect.visibility.labelRes())).also { haptics.error() }
            }
            snackbar.showSnackbar(message)
        }
    }

    val accent = hexColor(state.accentHex, MaterialTheme.colorScheme.primary)
    val tab = state.tab.takeIf { it in state.visibleTabs } ?: MyStoriesTab.PUBLISHED
    val onStoryTab = tab == MyStoriesTab.PUBLISHED || tab == MyStoriesTab.ARCHIVE
    val hasStories = state.active.isNotEmpty() || state.archived.isNotEmpty()
    val latest = rememberUpdatedState(state)
    val actions = remember(viewModel, onEditStory, onResumeDraft, onOpenStory) {
        MyStoryCardActions(
            onOpen = { id ->
                val current = latest.value
                when {
                    current.isSelecting -> viewModel.onEvent(MyStoriesUiEvent.ToggleSelected(id))
                    current.tab == MyStoriesTab.DRAFTS -> viewModel.onEvent(MyStoriesUiEvent.OpenDraft(id))
                    current.tab == MyStoriesTab.PUBLISHED -> current.ownUserId?.let(onOpenStory)
                }
            },
            onSelectStart = { id ->
                if (!latest.value.isSelecting) viewModel.onEvent(MyStoriesUiEvent.ToggleSelecting)
                viewModel.onEvent(MyStoriesUiEvent.ToggleSelected(id))
                haptics.medium()
            },
            onToggle = { id -> haptics.light(); viewModel.onEvent(MyStoriesUiEvent.ToggleSelected(id)) },
            onViewers = { id -> viewersStoryId = id },
            onComments = { _ -> latest.value.ownUserId?.let(onOpenStory) },
            onEdit = { id -> if (latest.value.tab == MyStoriesTab.DRAFTS) viewModel.onEvent(MyStoriesUiEvent.OpenDraft(id)) else onEditStory(id) },
            onRepublish = { id -> viewModel.onEvent(MyStoriesUiEvent.RequestRepublish(id)) },
            onDelete = { id ->
                viewModel.onEvent(
                    if (latest.value.tab == MyStoriesTab.DRAFTS) MyStoriesUiEvent.RequestDeleteDraft(id)
                    else MyStoriesUiEvent.RequestDelete(id),
                )
            },
        )
    }

    val queueActions = remember(viewModel) {
        StoryQueueActions(
            onRetryPending = { viewModel.onEvent(MyStoriesUiEvent.RetryPending(it)) },
            onCancelPending = { viewModel.onEvent(MyStoriesUiEvent.CancelPending(it)) },
            onResume = { viewModel.onEvent(MyStoriesUiEvent.ResumeFailed(it)) },
            onRetryFailed = { viewModel.onEvent(MyStoriesUiEvent.RetryFailed(it)) },
            onDiscardFailed = { viewModel.onEvent(MyStoriesUiEvent.RequestDiscardFailed(it)) },
        )
    }

    MeeshyBackground {
        Scaffold(
            snackbarHost = { SnackbarHost(snackbar) },
            bottomBar = {
                AnimatedVisibility(visible = state.isSelecting && state.selectedIds.isNotEmpty()) {
                    MyStoriesBulkBar(
                        count = state.selectedIds.size,
                        onDelete = { haptics.medium(); viewModel.onEvent(MyStoriesUiEvent.RequestBulkDelete) },
                    )
                }
            },
            containerColor = Color.Transparent,
        ) { padding ->
            Column(Modifier.fillMaxSize().padding(padding)) {
                MyStoriesToolbar(
                    accent = accent,
                    canSelect = onStoryTab && hasStories,
                    isSelecting = state.isSelecting,
                    onCreate = onCreateStory,
                    onToggleSelecting = { haptics.selection(); viewModel.onEvent(MyStoriesUiEvent.ToggleSelecting) },
                    onDone = onBack,
                )
                MyStoriesTabPicker(
                    tabs = state.visibleTabs,
                    selected = tab,
                    onSelect = { haptics.selection(); viewModel.onEvent(MyStoriesUiEvent.SelectTab(it)) },
                )
                MyStoriesBody(state = state, tab = tab, actions = actions, queueActions = queueActions)
            }
        }
    }

    state.pendingRepublish?.let { pending ->
        StoryAudienceSheet(
            visibility = pending.choice.visibility,
            userIds = pending.choice.userIds,
            mentions = emptyList(),
            hashtags = emptyList(),
            onChooseVisibility = { viewModel.onEvent(MyStoriesUiEvent.ChooseRepublishVisibility(it)) },
            onUserIdsChange = { viewModel.onEvent(MyStoriesUiEvent.SetRepublishUserIds(it)) },
            onAddMention = {},
            onRemoveMention = {},
            onRemoveHashtag = {},
            onDismiss = { viewModel.onEvent(MyStoriesUiEvent.DismissRepublish) },
            republish = true,
            canApply = pending.canConfirm,
            onApply = {
                haptics.medium()
                viewModel.onEvent(MyStoriesUiEvent.ConfirmRepublish)
            },
        )
    }

    state.pendingDelete?.let { pending ->
        val (title, message) = when (pending.target) {
            MyStoryDeleteConfirmation.Target.BULK_SELECTION ->
                R.string.my_stories_delete_selected_title to R.string.my_stories_delete_selected_message
            MyStoryDeleteConfirmation.Target.DRAFT ->
                R.string.my_stories_drafts_delete_title to R.string.my_stories_drafts_delete_message
            MyStoryDeleteConfirmation.Target.FAILED_ITEM ->
                R.string.my_stories_failed_delete_title to R.string.my_stories_failed_delete_message
            MyStoryDeleteConfirmation.Target.PUBLISHED_STORY ->
                R.string.my_stories_delete_title to R.string.my_stories_delete_message
        }
        AlertDialog(
            onDismissRequest = { viewModel.onEvent(MyStoriesUiEvent.DismissDelete) },
            title = { Text(stringResource(title)) },
            text = { Text(stringResource(message)) },
            confirmButton = {
                TextButton(onClick = { viewModel.onEvent(MyStoriesUiEvent.ConfirmDelete) }) {
                    Text(stringResource(R.string.my_stories_delete), color = MaterialTheme.colorScheme.error)
                }
            },
            dismissButton = {
                TextButton(onClick = { viewModel.onEvent(MyStoriesUiEvent.DismissDelete) }) {
                    Text(stringResource(R.string.my_stories_cancel))
                }
            },
        )
    }

    viewersStoryId?.let { id ->
        StoryViewersSheet(storyId = id, accentHex = state.accentHex, onDismiss = { viewersStoryId = null })
    }
}

private class EffectMessages(
    val deleted: String,
    val deleteFailed: String,
    val bulkDeleted: String,
    val republished: String,
    val republishFailed: String,
    val resumeFailed: String,
    val draftOpenFailed: String,
)

@Composable
private fun MyStoriesBody(
    state: MyStoriesUiState,
    tab: MyStoriesTab,
    actions: MyStoryCardActions,
    queueActions: StoryQueueActions,
) {
    val locale = LocalConfiguration.current.locales[0]
    val nowMillis = remember(state) { System.currentTimeMillis() }
    when (tab) {
        MyStoriesTab.QUEUE ->
            if (state.pendingUploads.isEmpty() && state.failed.isEmpty()) MyStoriesEmpty(tab)
            else MyStoriesQueue(state.pendingUploads, state.failed, nowMillis, state.accentHex, state.resumingCmid, queueActions, Modifier.fillMaxSize())
        MyStoriesTab.DRAFTS -> {
            val cards = remember(state.drafts, state.isSelecting, locale) {
                state.drafts.map { draft ->
                    MyStoryCardPresentation.of(
                        MyStoryCardRules.draft(
                            MyStoryCardRules.DraftInput(draft.id, draft.title, draft.coverFilePath, null, draft.backgroundHex, draft.updatedAtEpochMillis),
                        ),
                        nowMillis, locale, isSelecting = false, isSelected = false,
                    )
                }
            }
            if (cards.isEmpty()) MyStoriesEmpty(tab) else MyStoriesGrid(cards, state.accentHex, actions)
        }
        MyStoriesTab.PUBLISHED, MyStoriesTab.ARCHIVE -> {
            val entries = if (tab == MyStoriesTab.ARCHIVE) state.archived else state.active
            val cards = remember(entries, state.isSelecting, state.selectedIds, locale) {
                entries.map { entry ->
                    MyStoryCardPresentation.of(
                        MyStoryCardRules.fromStory(entry.item, entry.viewCount),
                        nowMillis, locale, state.isSelecting, entry.id in state.selectedIds,
                    )
                }
            }
            when {
                state.showSkeleton -> MyStoriesSkeleton()
                cards.isEmpty() -> MyStoriesEmpty(tab)
                else -> MyStoriesGrid(cards, state.accentHex, actions)
            }
        }
    }
}
