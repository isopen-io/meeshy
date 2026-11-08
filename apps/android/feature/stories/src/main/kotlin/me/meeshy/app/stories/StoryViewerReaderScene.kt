package me.meeshy.app.stories

import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.AnimationVector1D
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.getValue
import androidx.compose.ui.graphics.graphicsLayer
import me.meeshy.sdk.model.story.StoryCaptionPlacement
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalUriHandler
import me.meeshy.sdk.model.StoryItem
import me.meeshy.sdk.model.story.StoryReaderFloor
import me.meeshy.sdk.model.story.StorySentinelPolicy

/**
 * La scène du lecteur telle que l'iOS la compose : le fond (couleur ou dégradé de l'auteur, noir sous un média), le sol
 * flou, puis la CARTE 9:16 qui porte la scène — ou la sentinelle quand le format est plus récent que ce build — et
 * l'overlay de chargement cache-first. La sentinelle prend la place exacte de la scène ; barres, avatar et fermeture
 * restent ceux de la coque.
 */
@Composable
internal fun StoryViewerReaderScene(
    slide: StorySlideView,
    item: StoryItem?,
    progress: Animatable<Float, AnimationVector1D>,
    slideDurationMs: Int,
    playing: Boolean,
    lap: Int,
    state: StoryViewerUiState,
    commentsOpen: Boolean,
    viewModel: StoryViewerViewModel,
    chromeVisible: Boolean = !state.isPaused,
    fullscreen: Boolean = false,
    captionExpanded: Boolean = false,
) {
    val uriHandler = LocalUriHandler.current
    val unpaintable = StorySentinelPolicy.currentStoryIsUnpaintable(item?.storyEffects)
    val hasMedia = slide.imageUrl != null || slide.backgroundVideoUrl != null
    val contentProgress = if (!hasMedia || state.canAutoAdvance) 1f else 0f
    val floorHash = item?.let(StoryReaderFloor::backdropHash) ?: slide.backgroundThumbHash
    StoryReaderBackground(slide)
    StoryReaderSceneCard(
        state = StoryReaderCardState(chromeVisible = chromeVisible, isFullscreenSession = fullscreen, commentsOpen = commentsOpen),
        floor = { expanded -> StorySceneFloor(floorHash, expanded) },
    ) {
        // Légende dépliée : la scène s'efface et laisse remonter le fond de la slide — pas de voile (iOS `storySceneOpacity`).
        val sceneAlpha by animateFloatAsState(StoryCaptionPlacement.sceneOpacity(captionExpanded), label = "storyCaptionSceneDim")
        Box(Modifier.fillMaxSize().graphicsLayer { alpha = sceneAlpha }) {
            if (unpaintable) {
                StorySentinelView(
                    onUpdate = { uriHandler.openUri(StorySentinelPolicy.STORE_URL) },
                    onSkip = viewModel::advance,
                    modifier = Modifier.fillMaxSize(),
                )
            } else {
                StoryViewerCanvas(slide, progress, slideDurationMs, playing, state.isMuted, lap, viewModel)
                StoryLoadingOverlay(
                    slideKey = slide.id,
                    thumbHash = slide.backgroundThumbHash,
                    coverUrl = slide.backgroundPosterUrl,
                    progress = contentProgress,
                )
            }
        }
    }
}
