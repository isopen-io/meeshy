package me.meeshy.app.feed

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Icon
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import coil.compose.AsyncImage
import me.meeshy.feature.feed.R
import me.meeshy.ui.component.media.rememberThumbHashPainter
import me.meeshy.ui.icons.MeeshyIcons
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshyRadius
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.hexColor

/**
 * La couverture d'un réel dans le fil : sa scène muette, son image fixe (vignette, thumbHash) ou l'aplat d'accent —
 * jamais un lecteur par carte (la scène que le fil élit sous [sceneId] joue, muette). Un appui ouvre le lecteur de réels sur CE réel ([onOpen]).
 *
 * [modifier] fixe la taille de la couverture (hors scène) ; la scène, elle, garde son 9:16 (le lecteur de scène du module des
 * stories vient de [LocalRepostSceneRenderer]) et retombe sur l'aplat quand l'application n'en fournit pas.
 */
@Composable
internal fun ReelCoverView(
    cover: ReelCover,
    authorName: String?,
    onOpen: () -> Unit,
    modifier: Modifier = Modifier,
    sceneId: String? = null,
) {
    val renderer = LocalRepostSceneRenderer.current
    if (cover is ReelCover.Scene && renderer != null) {
        val live by rememberSceneLive(sceneId)
        renderer(cover.item, authorName, live, onOpen, Modifier.fillMaxWidth())
        return
    }
    val label = stringResource(R.string.feed_reel)
    Box(
        modifier = modifier
            .clip(RoundedCornerShape(MeeshyRadius.md))
            .background(MeeshyPalette.Indigo500.copy(alpha = BACKDROP_ALPHA))
            .clickable(role = Role.Button, onClick = onOpen)
            .semantics { contentDescription = label },
    ) {
        when (cover) {
            is ReelCover.Poster -> AsyncImage(
                model = cover.url,
                contentDescription = null,
                contentScale = ContentScale.Crop,
                placeholder = rememberThumbHashPainter(cover.thumbHash),
                error = rememberThumbHashPainter(cover.thumbHash),
                modifier = Modifier.fillMaxSize(),
            )
            is ReelCover.Backdrop, is ReelCover.Scene -> Unit
        }
        val glyph = when {
            cover is ReelCover.Poster && !cover.isVideo -> null
            cover is ReelCover.Backdrop && !cover.isVideo -> MeeshyIcons.MusicNote
            else -> MeeshyIcons.Play
        }
        glyph?.let {
            CoverGlyph(
                modifier = Modifier.align(Alignment.Center),
                hasDisc = cover !is ReelCover.Backdrop || cover.isVideo,
                icon = it,
            )
        }
        Box(
            modifier = Modifier
                .align(Alignment.TopEnd)
                .padding(MeeshySpacing.sm)
                .size(BADGE_SIZE)
                .clip(CircleShape)
                .background(Color.Black.copy(alpha = DISC_ALPHA)),
            contentAlignment = Alignment.Center,
        ) {
            Icon(MeeshyIcons.Slideshow, contentDescription = null, tint = MeeshyPalette.White, modifier = Modifier.size(BADGE_ICON))
        }
    }
}

@Composable
private fun CoverGlyph(modifier: Modifier, hasDisc: Boolean, icon: ImageVector) {
    Box(
        modifier = modifier
            .size(if (hasDisc) PLAY_DISC else GLYPH_SIZE)
            .clip(CircleShape)
            .background(if (hasDisc) Color.Black.copy(alpha = DISC_ALPHA) else Color.Transparent),
        contentAlignment = Alignment.Center,
    ) {
        Icon(icon, contentDescription = null, tint = MeeshyPalette.White, modifier = Modifier.size(if (hasDisc) PLAY_ICON else GLYPH_SIZE))
    }
}

/** Hauteur de la bande d'un réel cité (iOS `ReelRepostEmbedCell.stripHeight`). */
internal val REEL_STRIP_HEIGHT: Dp = 116.dp

private const val BACKDROP_ALPHA = 0.35f
private const val DISC_ALPHA = 0.45f
private val PLAY_DISC = 56.dp
private val PLAY_ICON = 32.dp
private val GLYPH_SIZE = 40.dp
private val BADGE_SIZE = 28.dp
private val BADGE_ICON = 16.dp
