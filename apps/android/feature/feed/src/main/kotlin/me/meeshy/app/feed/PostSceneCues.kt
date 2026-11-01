package me.meeshy.app.feed

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.Icon
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import me.meeshy.feature.feed.R
import me.meeshy.ui.icons.MeeshyIcons
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshySpacing

/** Le repère du glyphe de lecture d'une tuile, que les témoins comptent (il ne se dit pas : la tuile se dit « vidéo »). */
internal const val SCENE_PLAY_GLYPH_TAG = "feed-scene-play"

/**
 * Ce qu'une tuile de scène dit d'elle-même dans son coin (#14201, iOS `PostSceneMosaic.vignette`) : la page qui JOUE une scène
 * sonore dans un hôte qui la garde muette porte « son coupé » ; une scène animée au repos porte le glyphe de lecture ; une
 * scène fixe et muette ne porte rien.
 */
@Composable
internal fun SceneCue(playing: Boolean, mutedSound: Boolean, moves: Boolean, modifier: Modifier = Modifier) {
    when {
        playing && mutedSound -> CueDisc(
            icon = MeeshyIcons.VolumeOff,
            description = stringResource(R.string.feed_scene_sound_muted),
            ground = Color.Black.copy(alpha = 0.45f),
            tint = MeeshyPalette.White,
            modifier = modifier,
        )
        !playing && moves -> CueDisc(
            icon = MeeshyIcons.Play,
            description = null,
            ground = MeeshyPalette.White.copy(alpha = 0.85f),
            tint = Color.Black.copy(alpha = 0.75f),
            modifier = modifier.testTag(SCENE_PLAY_GLYPH_TAG),
        )
    }
}

@Composable
private fun CueDisc(icon: ImageVector, description: String?, ground: Color, tint: Color, modifier: Modifier) {
    Box(
        modifier = modifier.padding(MeeshySpacing.sm).size(CUE_SIZE).clip(CircleShape).background(ground),
        contentAlignment = Alignment.Center,
    ) {
        Icon(imageVector = icon, contentDescription = description, tint = tint, modifier = Modifier.size(CUE_ICON_SIZE))
    }
}

/** Le libellé d'une tuile ou d'une page : sa place, et « vidéo » pour une scène qui bouge (iOS `PostSceneMosaic.libelle`). */
@Composable
internal fun sceneTileLabel(place: String, moves: Boolean): String =
    if (moves) "$place, ${stringResource(R.string.feed_scene_video)}" else place

private val CUE_SIZE = 22.dp
private val CUE_ICON_SIZE = 13.dp
