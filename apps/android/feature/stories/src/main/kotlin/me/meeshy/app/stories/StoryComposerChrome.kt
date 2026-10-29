package me.meeshy.app.stories

import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.TextLayoutResult
import androidx.compose.ui.text.style.TextOverflow
import me.meeshy.feature.stories.R
import me.meeshy.ui.icons.MeeshyIcons

/**
 * The story composer's own top bar (title or format menu, close, export menu, undo/redo, publish) — the
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
        title = titleContent ?: { StoryComposerTitle() },
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
            TextButton(onClick = viewModel::publish, enabled = state.canPublish) {
                Text(publishLabel(state.publishTitle))
            }
        },
    )
}

/** The bar title: one line, ellipsized, so the neighbouring buttons keep their full touch targets (#13639). */
@Composable
internal fun StoryComposerTitle(modifier: Modifier = Modifier, onTextLayout: (TextLayoutResult) -> Unit = {}) {
    Text(
        text = stringResource(R.string.stories_composer_title),
        maxLines = 1,
        overflow = TextOverflow.Ellipsis,
        onTextLayout = onTextLayout,
        modifier = modifier,
    )
}
