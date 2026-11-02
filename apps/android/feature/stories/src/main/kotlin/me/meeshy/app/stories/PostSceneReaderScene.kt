package me.meeshy.app.stories

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.hilt.navigation.compose.hiltViewModel
import me.meeshy.sdk.model.StoryItem

/**
 * Une scène de post en plein écran (iOS `PostSceneCardContainer` en lecture) : la même projection et le même lecteur que la carte
 * du fil, mais la scène entière, 9:16 posée au centre sans rognage, et son son joue — c'est l'écran qu'on a ouvert pour elle.
 * Elle ne joue que quand l'hôte la montre ([playing]) ; sinon c'est une image fixe.
 */
@Composable
fun PostSceneReaderScene(
    item: StoryItem,
    accentHex: String?,
    playing: Boolean,
    modifier: Modifier = Modifier,
    viewModel: RepostSceneViewModel = hiltViewModel(),
) {
    val slide = remember(item, accentHex) { viewModel.slideOf(item, accentHex = accentHex ?: READER_FALLBACK_ACCENT) }
    Box(modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
        StoryScenePlayer(
            slide = slide,
            playing = playing,
            muted = false,
            loads = true,
            rewindWhenIdle = true,
            modifier = Modifier.aspectRatio(SCENE_ASPECT, matchHeightConstraintsFirst = true),
            resting = !playing,
        )
    }
}

private const val SCENE_ASPECT = 9f / 16f
private const val READER_FALLBACK_ACCENT = "6366F1"
