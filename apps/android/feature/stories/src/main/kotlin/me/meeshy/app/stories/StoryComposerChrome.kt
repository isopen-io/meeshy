package me.meeshy.app.stories

import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.TopAppBar
import androidx.compose.foundation.layout.size
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.compose.ui.res.stringResource
import me.meeshy.feature.stories.R
import me.meeshy.ui.icons.MeeshyIcons

/**
 * The story composer's own top bar (format menu when hosted — no title, like iOS —, close, export menu, undo/redo, publish) — the
 * stand-alone presentation, kept out of [StoryComposerScreen] so the screen stays glue.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
internal fun StoryComposerTopBar(
    state: StoryComposerUiState,
    viewModel: StoryComposerViewModel,
    sceneExport: SceneExportHost,
    onClose: () -> Unit,
    titleContent: (@Composable () -> Unit)?,
) {
    TopAppBar(
        title = titleContent ?: {},
        navigationIcon = {
            IconButton(onClick = onClose) {
                Icon(MeeshyIcons.Close, contentDescription = stringResource(R.string.stories_composer_cancel))
            }
        },
        actions = {
            ComposerOverflowMenu(
                entries = sceneExport.entries,
                enabled = !sceneExport.isExporting && !state.isPublishing,
                onPick = sceneExport::start,
            )
            IconButton(onClick = viewModel::onUndo, enabled = state.canUndo) {
                Icon(MeeshyIcons.Undo, contentDescription = stringResource(R.string.story_composer_undo))
            }
            IconButton(onClick = viewModel::onRedo, enabled = state.canRedo) {
                Icon(MeeshyIcons.Redo, contentDescription = stringResource(R.string.story_composer_redo))
            }
            StoryPublishAction(
                label = publishLabel(state.publishTitle),
                enabled = state.canPublish,
                onClick = viewModel::publish,
            )
        },
    )
}

/**
 * Publish as a compact icon action (iOS keeps no text label in the top row, and has no title there either): a
 * full 48 dp touch target named for TalkBack by [label], so the bar never has to trade room with a long word (#13639).
 */
@Composable
internal fun StoryPublishAction(label: String, enabled: Boolean, onClick: () -> Unit) {
    IconButton(onClick = onClick, enabled = enabled, modifier = Modifier.size(PUBLISH_TARGET)) {
        Icon(MeeshyIcons.Send, contentDescription = label)
    }
}

private val PUBLISH_TARGET = 48.dp
