package me.meeshy.app.stories

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.MoreVert
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.layout.onSizeChanged
import androidx.compose.ui.res.stringResource
import me.meeshy.feature.stories.R
import me.meeshy.ui.haptics.MeeshyHaptics
import me.meeshy.ui.icons.MeeshyIcons
import me.meeshy.ui.theme.MeeshyPalette
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
    showsRepost: Boolean,
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
            if (slide != null && slide.hasSound) {
                StoryMuteButton(isMuted = state.isMuted, onToggle = viewModel::toggleMute)
            }
            if (slide?.isTranslated == true) {
                TranslatedBadge()
            }
            if (state.currentStoryId != null) {
                StoryOptionsMenu(state, chrome, showsRepost, videoExport, actions)
            }
            IconButton(onClick = actions.onClose) {
                Icon(
                    MeeshyIcons.Close,
                    contentDescription = stringResource(R.string.stories_viewer_close),
                    tint = MeeshyPalette.White,
                )
            }
        }
    }
}

@Composable
private fun StoryOptionsMenu(
    state: StoryViewerUiState,
    chrome: StoryViewerChromeState,
    showsRepost: Boolean,
    videoExport: StoryVideoExport,
    actions: StoryViewerActions,
) {
    val storyId = state.currentStoryId
    Box {
        IconButton(onClick = { chrome.showOptions = true }) {
            Icon(
                Icons.Filled.MoreVert,
                contentDescription = stringResource(R.string.stories_options),
                tint = MeeshyPalette.White,
            )
        }
        DropdownMenu(expanded = chrome.showOptions, onDismissRequest = { chrome.showOptions = false }) {
            // « Partager » (#14315) : hors de Meeshy, par la feuille du système ; « Envoyer » est au rail.
            DropdownMenuItem(
                text = { Text(stringResource(R.string.stories_action_share)) },
                leadingIcon = { Icon(MeeshyIcons.Share, contentDescription = null) },
                onClick = {
                    chrome.showOptions = false
                    actions.share()
                },
            )
            StoryVideoExportMenuEntries(onPick = { mode ->
                chrome.showOptions = false
                videoExport.start(mode)
            })
            val compose = actions.onComposeStory
            if (compose != null && state.canCompose && storyId != null) {
                DropdownMenuItem(
                    text = { Text(stringResource(R.string.story_viewer_compose)) },
                    leadingIcon = { Icon(MeeshyIcons.MagicWand, contentDescription = null) },
                    onClick = {
                        chrome.showOptions = false
                        compose(storyId)
                    },
                )
            }
            if (state.isOwnStory) {
                OwnStoryMenuItems(state, chrome, actions)
            } else {
                OtherStoryMenuItems(chrome, showsRepost, actions)
            }
        }
    }
}

@Composable
private fun OwnStoryMenuItems(state: StoryViewerUiState, chrome: StoryViewerChromeState, actions: StoryViewerActions) {
    val edit = actions.onEditStory
    if (edit != null && StoryEditEntry.offered(state.isOwnStory, state.currentStoryId)) {
        DropdownMenuItem(
            text = { Text(stringResource(R.string.my_stories_edit)) },
            leadingIcon = { Icon(MeeshyIcons.Edit, contentDescription = null) },
            onClick = {
                chrome.showOptions = false
                state.currentStoryId?.let(edit)
            },
        )
    }
    DropdownMenuItem(
        text = { Text(stringResource(R.string.stories_action_delete), color = MeeshyPalette.Error) },
        leadingIcon = { Icon(MeeshyIcons.Delete, contentDescription = null, tint = MeeshyPalette.Error) },
        onClick = {
            chrome.showOptions = false
            chrome.showDeleteDialog = true
        },
    )
}

@Composable
private fun OtherStoryMenuItems(chrome: StoryViewerChromeState, showsRepost: Boolean, actions: StoryViewerActions) {
    if (showsRepost) {
        DropdownMenuItem(
            text = { Text(stringResource(R.string.stories_action_repost)) },
            leadingIcon = { Icon(MeeshyIcons.Repeat, contentDescription = null) },
            onClick = {
                chrome.showOptions = false
                actions.repost()
            },
        )
    }
    DropdownMenuItem(
        text = { Text(stringResource(R.string.stories_action_report)) },
        leadingIcon = { Icon(MeeshyIcons.Warning, contentDescription = null) },
        onClick = {
            chrome.showOptions = false
            chrome.showReportDialog = true
        },
    )
}
