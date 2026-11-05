package me.meeshy.app.stories

import androidx.annotation.StringRes
import androidx.compose.foundation.layout.Box
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LocalContentColor
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.res.stringResource
import me.meeshy.feature.stories.R
import me.meeshy.sdk.model.story.StoryOptionsMenuEntry
import me.meeshy.sdk.model.story.StoryRepostDestination
import me.meeshy.sdk.model.story.StoryOptionsMenuPlan
import me.meeshy.ui.icons.MeeshyIcons
import me.meeshy.ui.theme.MeeshyPalette

/**
 * Le menu ⋮ du lecteur rend le PLAN section par section (iOS `FullscreenMoreMenu`) : sa composition se décide dans
 * [StoryOptionsMenuPlan] (`:core:model`), jamais ici. Une entrée dont l'action n'est pas branchée est masquée ; un
 * autre lot branche la sienne (plein écran, transcription, imager, rendre privée) par [StoryViewerActions.entryHandlers],
 * sans toucher l'en-tête. « Fermer » est la dernière entrée : il n'y a plus de bouton X, le glissé bas ferme.
 */
@Composable
internal fun StoryOptionsMenu(
    state: StoryViewerUiState,
    chrome: StoryViewerChromeState,
    videoExport: StoryVideoExport,
    actions: StoryViewerActions,
    mayRemove: Boolean,
) {
    val storyId = state.currentStoryId
    val composable = actions.onComposeStory != null && state.canCompose && storyId != null
    val wired = buildSet {
        add(StoryOptionsMenuEntry.Share)
        add(StoryOptionsMenuEntry.ExportVideo)
        if (composable) add(StoryOptionsMenuEntry.Compose)
        add(StoryOptionsMenuEntry.Report)
        add(StoryOptionsMenuEntry.Delete)
        if (mayRemove) add(StoryOptionsMenuEntry.Remove)
        addAll(actions.entryHandlers.keys)
    }
    val plan = StoryOptionsMenuPlan
        .resolve(
            hasStory = storyId != null,
            isOwnStory = state.isOwnStory,
            hasAudioTranscript = StoryOptionsMenuEntry.Transcript in actions.entryHandlers,
            canCompose = composable,
            canRemove = mayRemove,
        )
        .onlyWired(wired)
    Box {
        IconButton(onClick = { chrome.showOptions = true }) {
            Icon(
                MeeshyIcons.MoreVert,
                contentDescription = stringResource(R.string.stories_options),
                tint = MeeshyPalette.White,
            )
        }
        DropdownMenu(expanded = chrome.showOptions, onDismissRequest = { chrome.showOptions = false }) {
            plan.sections.forEachIndexed { index, section ->
                if (index > 0) HorizontalDivider()
                section.forEach { entry -> StoryOptionsMenuItem(entry, state, chrome, videoExport, actions) }
            }
        }
    }
}

@Composable
private fun StoryOptionsMenuItem(
    entry: StoryOptionsMenuEntry,
    state: StoryViewerUiState,
    chrome: StoryViewerChromeState,
    videoExport: StoryVideoExport,
    actions: StoryViewerActions,
) {
    val storyId = state.currentStoryId
    fun act(block: () -> Unit) {
        chrome.showOptions = false
        block()
    }
    val handler = actions.entryHandlers[entry]
    when (entry) {
        StoryOptionsMenuEntry.Share -> {
            StoryMenuRow(R.string.stories_action_share, MeeshyIcons.Share) { act(actions.share) }
            actions.repostTo?.let { repostTo ->
                StoryMenuRow(R.string.story_repost_menu_feed, MeeshyIcons.Repeat) { act { repostTo(StoryRepostDestination.POST) } }
                StoryMenuRow(R.string.story_repost_menu_reel, MeeshyIcons.Repeat) { act { repostTo(StoryRepostDestination.REEL) } }
            }
        }
        StoryOptionsMenuEntry.ExportVideo -> StoryVideoExportMenuEntries(onPick = { mode -> act { videoExport.start(mode) } })
        StoryOptionsMenuEntry.Compose -> StoryMenuRow(R.string.story_viewer_compose, MeeshyIcons.ComposeNew) {
            act { storyId?.let { id -> actions.onComposeStory?.invoke(id) } }
        }
        StoryOptionsMenuEntry.Report -> StoryMenuRow(R.string.stories_action_report, MeeshyIcons.Warning) { act { chrome.showReportDialog = true } }
        StoryOptionsMenuEntry.Remove -> StoryMenuRow(R.string.stories_header_remove, MeeshyIcons.Delete, destructive = true) {
            act { chrome.showRemoveDialog = true }
        }
        StoryOptionsMenuEntry.Delete -> {
            val edit = actions.onEditStory
            if (edit != null && StoryEditEntry.offered(state.isOwnStory, storyId)) {
                StoryMenuRow(R.string.my_stories_edit, MeeshyIcons.Edit) { act { storyId?.let(edit) } }
            }
            StoryMenuRow(R.string.stories_action_delete, MeeshyIcons.Delete, destructive = true) { act { chrome.showDeleteDialog = true } }
        }
        StoryOptionsMenuEntry.Close -> StoryMenuRow(R.string.stories_viewer_close, MeeshyIcons.Close) { act(actions.onClose) }
        // Branchées par leur lot : l'action porte son libellé et son icône (`entryHandlers`).
        StoryOptionsMenuEntry.Fullscreen,
        StoryOptionsMenuEntry.Transcript,
        StoryOptionsMenuEntry.Imager,
        StoryOptionsMenuEntry.MakePrivate,
        -> handler?.let { action -> StoryMenuRow(action.labelRes, action.icon) { act(action.onClick) } }
    }
}

@Composable
private fun StoryMenuRow(@StringRes labelRes: Int, icon: ImageVector, destructive: Boolean = false, onClick: () -> Unit) {
    val tint = if (destructive) MeeshyPalette.Error else LocalContentColor.current
    DropdownMenuItem(
        text = { Text(stringResource(labelRes), color = if (destructive) MeeshyPalette.Error else LocalContentColor.current) },
        leadingIcon = { Icon(icon, contentDescription = null, tint = tint) },
        onClick = onClick,
    )
}
