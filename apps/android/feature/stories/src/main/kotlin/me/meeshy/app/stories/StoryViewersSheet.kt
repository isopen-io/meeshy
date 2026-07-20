package me.meeshy.app.stories

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Text
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import me.meeshy.feature.stories.R
import me.meeshy.sdk.model.StoryViewer
import me.meeshy.sdk.theme.DynamicColorGenerator
import me.meeshy.ui.component.MeeshyAvatar
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.hexColor

/**
 * Who-viewed sheet for an author's own story — parity with iOS `StoryViewersSheet`.
 * Instant-App: a skeleton/spinner shows only on a cold load; once loaded it shows
 * the most-recent-first viewer list (ordering done by the ViewModel), a friendly
 * empty state, or an error line on a cold failure. The accent colour ties it to
 * the open story.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun StoryViewersSheet(
    storyId: String,
    accentHex: String,
    onDismiss: () -> Unit,
    viewModel: StoryViewersViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    LaunchedEffect(storyId) { viewModel.load(storyId) }

    val sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)
    ModalBottomSheet(onDismissRequest = onDismiss, sheetState = sheetState) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .navigationBarsPadding()
                .padding(horizontal = MeeshySpacing.md, vertical = MeeshySpacing.sm),
            verticalArrangement = Arrangement.spacedBy(MeeshySpacing.sm),
        ) {
            Text(
                text = if (state.viewers.isEmpty()) {
                    stringResourceTitle()
                } else {
                    countLabel(state.viewers.size)
                },
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.Bold,
                color = hexColor(accentHex),
            )

            when {
                state.isLoading -> LoadingRow(loadingLabel())
                state.errorMessage != null -> CenteredMessage(errorLabel())
                state.isEmpty -> EmptyViewers()
                else -> ViewerList(state.viewers)
            }
        }
    }
}

@Composable
private fun stringResourceTitle() =
    androidx.compose.ui.res.stringResource(R.string.stories_viewers_title)

@Composable
private fun countLabel(count: Int) =
    androidx.compose.ui.res.stringResource(R.string.stories_viewers_count, count)

@Composable
private fun loadingLabel() =
    androidx.compose.ui.res.stringResource(R.string.stories_viewers_loading)

@Composable
private fun errorLabel() =
    androidx.compose.ui.res.stringResource(R.string.stories_viewers_error)

@Composable
private fun ViewerList(viewers: List<StoryViewer>) {
    LazyColumn(
        modifier = Modifier.heightIn(max = 480.dp),
        verticalArrangement = Arrangement.spacedBy(MeeshySpacing.sm),
    ) {
        items(viewers, key = { it.id }) { viewer ->
            ViewerRow(viewer)
        }
    }
}

@Composable
private fun ViewerRow(viewer: StoryViewer) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.sm),
    ) {
        MeeshyAvatar(
            name = viewer.displayName,
            size = 40.dp,
            containerColor = hexColor(DynamicColorGenerator.colorForName(viewer.displayName)),
        )
        Text(
            text = viewer.displayName,
            style = MaterialTheme.typography.bodyLarge,
            fontWeight = FontWeight.Medium,
            modifier = Modifier.weight(1f),
        )
        viewer.reactionEmoji?.let { emoji ->
            Text(text = emoji, style = MaterialTheme.typography.titleMedium)
        }
    }
}

@Composable
private fun EmptyViewers() {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .padding(vertical = MeeshySpacing.xl),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(MeeshySpacing.xs),
    ) {
        Text(
            text = androidx.compose.ui.res.stringResource(R.string.stories_viewers_empty_title),
            style = MaterialTheme.typography.titleSmall,
            fontWeight = FontWeight.SemiBold,
            textAlign = TextAlign.Center,
        )
        Text(
            text = androidx.compose.ui.res.stringResource(R.string.stories_viewers_empty_subtitle),
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            textAlign = TextAlign.Center,
        )
    }
}

@Composable
private fun LoadingRow(message: String) {
    Box(
        modifier = Modifier
            .fillMaxWidth()
            .padding(vertical = MeeshySpacing.xl),
        contentAlignment = Alignment.Center,
    ) {
        Row(
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.sm),
        ) {
            CircularProgressIndicator(modifier = Modifier.padding(end = MeeshySpacing.xs))
            Text(text = message, style = MaterialTheme.typography.bodyMedium)
        }
    }
}

@Composable
private fun CenteredMessage(message: String) {
    Box(
        modifier = Modifier
            .fillMaxWidth()
            .padding(vertical = MeeshySpacing.xl),
        contentAlignment = Alignment.Center,
    ) {
        Text(
            text = message,
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            textAlign = TextAlign.Center,
        )
    }
}
