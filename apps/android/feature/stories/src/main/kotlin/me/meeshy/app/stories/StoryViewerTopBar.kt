package me.meeshy.app.stories

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.layout.onSizeChanged
import androidx.compose.ui.res.stringResource
import me.meeshy.feature.stories.R
import me.meeshy.sdk.model.profile.ProfileSheetUser
import me.meeshy.sdk.model.profile.ofAuthor
import me.meeshy.ui.component.audio.BackgroundSoundBadge
import me.meeshy.ui.component.audio.BackgroundSoundBadgeLabels
import me.meeshy.ui.haptics.MeeshyHaptics
import me.meeshy.ui.profile.LocalProfileSheetOpener
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
    scrubber: StoryProgressScrubber,
    awaitingStart: Boolean,
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
        val hapticScrubber = remember(scrubber, haptics) {
            StoryProgressScrubber(scrubber.fraction, { haptics.light(); scrubber.begin() }, scrubber.moveTo, scrubber.end)
        }
        SegmentedProgress(count = state.slides.size, index = state.index, currentProgress = progress, scrubber = hapticScrubber)
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(top = MeeshySpacing.sm),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            val profileOpener = LocalProfileSheetOpener.current
            val author = remember(state.authorUserId, state.authorName, state.authorAvatarUrl, accent) {
                ProfileSheetUser.ofAuthor(
                    userId = state.authorUserId,
                    displayName = state.authorName,
                    avatarUrl = state.authorAvatarUrl,
                )
            }
            StoryAuthorIdentity(
                onClick = author?.let { user ->
                    {
                        haptics.light()
                        profileOpener.open(user)
                    }
                },
                onLongClick = author?.let { user ->
                    {
                        haptics.medium()
                        profileOpener.open(user)
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
            StoryAwaitingSpinner(awaiting = awaitingStart, modifier = Modifier.padding(end = MeeshySpacing.sm))
            if (slide?.isTranslated == true) {
                TranslatedBadge()
            }
            if (state.currentStoryId != null) {
                StoryOptionsMenu(state, chrome, videoExport, actions, mayRemove = viewModel.mayRemoveCurrentStory())
            }
        }
        slide?.backgroundAudio?.takeIf { it.showsMuteControl }?.let { announcement ->
            BackgroundSoundBadge(
                announcement = announcement,
                tint = MeeshyPalette.White.copy(alpha = BADGE_OPACITY),
                isMuted = state.isMuted,
                labels = BackgroundSoundBadgeLabels(
                    track = stringResource(R.string.stories_viewer_a11y_background_audio),
                    muted = stringResource(R.string.stories_action_mute),
                    sound = stringResource(R.string.stories_action_sound),
                ),
                onToggleMute = { haptics.light(); viewModel.toggleMute() },
                modifier = Modifier.padding(start = MeeshySpacing.xs),
            )
        }
    }
}

private const val BADGE_OPACITY = 0.9f
