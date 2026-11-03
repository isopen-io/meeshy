package me.meeshy.app.stories

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.layout.onSizeChanged
import me.meeshy.ui.haptics.MeeshyHaptics
import me.meeshy.ui.theme.MeeshySpacing

/**
 * Propriétaire : lot story-viewer-decomposition-and-nav-graph. L'en-tête du lecteur : barres de progression,
 * identité de l'auteur, son, pastille « traduit », menu ⋮ et fermeture. Un lot qui ajoute une entrée de menu ou un
 * bouton d'en-tête l'ajoute ICI (les identités vivent dans `StoryViewerHeader`).
 */
@Composable
internal fun StoryViewerTopBar(
    state: StoryViewerUiState,
    slide: StorySlideView?,
    accent: String,
    progress: () -> Float,
    chrome: StoryViewerChromeState,
    videoExport: StoryVideoExport,
    actions: StoryViewerActions,
    haptics: MeeshyHaptics,
    viewModel: StoryViewerViewModel,
    onHeight: (Int) -> Unit,
) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .onSizeChanged { onHeight(it.height) }
            .statusBarsPadding()
            .padding(horizontal = MeeshySpacing.sm, vertical = MeeshySpacing.sm),
    ) {
        SegmentedProgress(count = state.slides.size, index = state.index, currentProgress = progress)
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(top = MeeshySpacing.sm),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            StoryAuthorIdentity(
                onClick = state.authorUserId?.let { userId ->
                    {
                        haptics.light()
                        actions.onOpenProfile(userId)
                    }
                },
                onLongClick = state.authorUserId?.let { userId ->
                    {
                        haptics.medium()
                        actions.onOpenProfile(userId)
                    }
                },
                name = state.authorName,
                avatarUrl = state.authorAvatarUrl,
                accentHex = accent,
                authorUserId = state.authorUserId,
                authorPresence = state.authorPresence,
                createdAtMillis = slide?.createdAtMillis,
                repostAttribution = slide?.repostAttribution,
                modifier = Modifier
                    .weight(1f)
                    .padding(start = MeeshySpacing.xs),
            )
            if (slide?.isTranslated == true) {
                TranslatedBadge()
            }
            if (state.currentStoryId != null) {
                StoryOptionsMenu(state, chrome, videoExport, actions, mayRemove = viewModel.mayRemoveCurrentStory())
            }
        }
    }
}
