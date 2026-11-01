package me.meeshy.app.feed

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
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
import me.meeshy.ui.theme.MeeshyOpacity
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshyRadius
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.hexColor

/**
 * La couverture d'un réel dans le fil : sa scène muette, son image fixe (vignette, thumbHash) ou l'aplat de la couleur de son
 * auteur — jamais un lecteur par carte (la scène que le fil élit sous [sceneId] joue, muette). Un appui ouvre le lecteur de réels
 * sur CE réel ([onOpen]) ; la couverture se lit « Réel de [authorName] » (iOS `feed.reel.card.a11y`).
 *
 * [modifier] fixe le cadre de la couverture ; la scène le REMPLIT (cadrage « fill », comme iOS `ReelCardSceneBackdrop`) au lieu de
 * garder le 9:16 d'une story. Le lecteur de scène du module des stories vient de [LocalReelSceneRenderer] ; sans lui, l'aplat.
 */
@Composable
internal fun ReelCoverView(
    cover: ReelCover,
    authorName: String?,
    onOpen: () -> Unit,
    modifier: Modifier = Modifier,
    sceneId: String? = null,
) {
    val label = stringResource(R.string.feed_reel_card_a11y, authorName ?: stringResource(R.string.feed_unknown_author))
    val sceneRenderer = LocalReelSceneRenderer.current
    if (cover is ReelCover.Scene && sceneRenderer != null) {
        val live by rememberSceneLive(sceneId)
        Box(
            modifier = modifier
                .sceneFrame(sceneId)
                .clip(RoundedCornerShape(MeeshyRadius.md))
                .background(Color.Black)
                .clickable(role = Role.Button, onClick = onOpen)
                .semantics { contentDescription = label },
        ) {
            sceneRenderer(cover.item, cover.accentHex, live, true, Modifier.fillMaxSize())
        }
        return
    }
    Box(
        modifier = modifier
            .clip(RoundedCornerShape(MeeshyRadius.md))
            .background(cover.backdropTint())
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
        val isSound = cover is ReelCover.Scene || (cover is ReelCover.Backdrop && !cover.isVideo)
        val glyph = when {
            cover is ReelCover.Poster && !cover.isVideo -> null
            isSound -> MeeshyIcons.MusicNote
            else -> MeeshyIcons.Play
        }
        glyph?.let { CoverGlyph(modifier = Modifier.align(Alignment.Center), hasDisc = !isSound, icon = it) }
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

private const val DISC_ALPHA = 0.45f
private val PLAY_DISC = 56.dp
private val PLAY_ICON = 32.dp
private val GLYPH_SIZE = 40.dp
private val BADGE_SIZE = 28.dp
private val BADGE_ICON = 16.dp

/** Le fond d'une couverture sans image : la couleur de l'auteur à l'opacité `strong` (iOS `Color(hex: authorColor).opacity(strong)`), indigo sans couleur. */
internal fun ReelCover.backdropTint(): Color {
    val hex = when (this) {
        is ReelCover.Backdrop -> accentHex
        is ReelCover.Scene -> accentHex
        is ReelCover.Poster -> tintHex
    }
    val base = hex?.let { hexColor(it, MeeshyPalette.Indigo500) } ?: MeeshyPalette.Indigo500
    return base.copy(alpha = MeeshyOpacity.strong)
}
