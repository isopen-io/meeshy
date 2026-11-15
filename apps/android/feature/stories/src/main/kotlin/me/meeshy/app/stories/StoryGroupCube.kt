package me.meeshy.app.stories

import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.drawWithContent
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.layout.onSizeChanged
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.hilt.navigation.compose.hiltViewModel
import me.meeshy.ui.component.media.rememberThumbHashPainter
import me.meeshy.ui.theme.MeeshyPalette

/**
 * Les faces des groupes voisins du cube (iOS `NeighborGroupCubeFace`) : un backdrop statique LÉGER — le ThumbHash du
 * slide d'entrée, jamais une seconde scène interactive — surmonté de la carte d'identité PARTAGÉE avec l'interlude, qui
 * monte au doigt. Au commit, la face est à plat quand la vraie carte la remplace : l'échange est invisible.
 *
 * Un groupe voisin n'est monté que s'il a une story affichable, et seulement le temps du glissé ([StoryCardMotion.cubeNeighborsMounted]).
 */
@Composable
internal fun StoryGroupCubeNeighbors(
    motion: StoryCardMotion,
    previous: StoryGroupSlides?,
    next: StoryGroupSlides?,
    identities: StoryGroupIntroViewModel = hiltViewModel(),
) {
    if (!motion.cubeNeighborsMounted) return
    next?.takeIf { it.slides.isNotEmpty() }?.let { StoryGroupCubeFace(motion, it, towardsNext = true, identities = identities) }
    previous?.takeIf { it.slides.isNotEmpty() }?.let { StoryGroupCubeFace(motion, it, towardsNext = false, identities = identities) }
}

@Composable
private fun StoryGroupCubeFace(
    motion: StoryCardMotion,
    group: StoryGroupSlides,
    towardsNext: Boolean,
    identities: StoryGroupIntroViewModel,
) {
    val intro = remember(group.userId) { identities.resolvedOrNull(group) }
    val presence = remember(group.userId) { identities.presenceDetail(group) }
    val hash = group.slides.firstOrNull()?.backgroundThumbHash
    val painter = rememberThumbHashPainter(hash)
    Box(
        Modifier
            .fillMaxSize()
            .clearAndSetSemantics { }
            .storyCubeNeighborFrame(motion, towardsNext),
    ) {
        if (painter != null) {
            Image(painter, contentDescription = null, contentScale = ContentScale.Crop, modifier = Modifier.fillMaxSize())
        } else {
            Box(
                Modifier.fillMaxSize().background(
                    Brush.linearGradient(listOf(MeeshyPalette.Indigo950, MeeshyPalette.Indigo900)),
                ),
            )
        }
        Box(Modifier.fillMaxSize().background(Color.Black.copy(alpha = BACKDROP_SCRIM)))
        intro?.let {
            StoryAuthorIdentityCard(
                intro = it,
                avatarUrl = group.avatarUrl,
                presence = presence,
                contentAlpha = {
                    StoryGroupCubeGeometry.identityOpacity(StoryGroupCubeGeometry.revealProgress(motion.offsetX.value, motion.width))
                },
            )
        }
    }
}

/**
 * Le cadre d'une face voisine : la même géométrie que la face courante, à la position que l'arête commune lui assigne.
 * La face du côté opposé au geste, comme toute face de dos, n'est jamais dessinée.
 */
private fun Modifier.storyCubeNeighborFrame(motion: StoryCardMotion, towardsNext: Boolean): Modifier = this
    .onSizeChanged { motion.width = it.width.toFloat() }
    .graphicsLayer {
        val current = motion.offsetX.value
        val offset = StoryGroupCubeGeometry.neighborOffset(current, size.width)
        val cube = StoryGroupCubeGeometry.face(offset, size.width)
        val onThisSide = if (towardsNext) current < 0f else current > 0f
        translationX = cube.translationX
        rotationY = cube.rotationYDegrees
        cameraDistance = StoryCubeTransform.cameraDistance(size.width)
        scaleX = cube.scale
        scaleY = cube.scale
        alpha = if (onThisSide && cube.isFacingViewer) 1f else 0f
    }
    .drawWithContent {
        drawContent()
        val shade = StoryGroupCubeGeometry.face(StoryGroupCubeGeometry.neighborOffset(motion.offsetX.value, size.width), size.width).shade
        if (shade > 0f) drawRect(Color.Black, alpha = shade)
    }

private const val BACKDROP_SCRIM = 0.35f
