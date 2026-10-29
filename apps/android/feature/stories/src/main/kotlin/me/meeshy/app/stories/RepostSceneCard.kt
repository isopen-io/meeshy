package me.meeshy.app.stories

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import me.meeshy.feature.stories.R
import me.meeshy.sdk.model.StoryItem
import me.meeshy.ui.theme.MeeshyRadius

/**
 * La scène d'une story reposté, incrustée dans une carte du fil — iOS `StoryRepostEmbedCell` : la scène seule
 * (9:16, muette), au même rendu que le lecteur de stories : même projection ([StorySlideProjector]),
 * même lecteur ([StoryScenePlayer]). Elle joue seulement quand le fil l'élit ([live]) ; sinon c'est une image fixe, sans
 * aucun lecteur (#13663). Un appui ouvre l'original.
 */
@Composable
fun RepostSceneCard(
    item: StoryItem,
    authorName: String?,
    live: Boolean,
    onOpen: () -> Unit,
    modifier: Modifier = Modifier,
    viewModel: RepostSceneViewModel = hiltViewModel(),
) {
    val slide = remember(item) { viewModel.slideOf(item, accentHex = SCENE_FALLBACK_ACCENT) }
    val by = stringResource(R.string.stories_repost_by)
    val label = authorName?.let { "$by $it" } ?: by
    Box(
        modifier = modifier
            .widthIn(max = SCENE_MAX_WIDTH)
            .aspectRatio(SCENE_ASPECT)
            .clip(RoundedCornerShape(MeeshyRadius.lg))
            .background(StorySceneFill.resolve(slide.background, slide.accentHex).brush())
            .clickable(role = Role.Button, onClick = onOpen)
            .semantics { contentDescription = label },
    ) {
        StoryScenePlayer(
            slide = slide,
            playing = live,
            muted = true,
            loads = true,
            rewindWhenIdle = false,
            resting = !live,
            modifier = Modifier.fillMaxSize(),
        )
    }
}

private const val SCENE_ASPECT = 9f / 16f
private val SCENE_MAX_WIDTH = 420.dp
private const val SCENE_FALLBACK_ACCENT = "6366F1"
