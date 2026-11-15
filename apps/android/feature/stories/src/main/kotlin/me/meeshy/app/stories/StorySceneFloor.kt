package me.meeshy.app.stories

import android.os.Build
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.blur
import androidx.compose.ui.draw.clipToBounds
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.unit.dp
import me.meeshy.sdk.model.story.StoryReaderBackdrop
import me.meeshy.sdk.model.story.StoryReaderFloor
import me.meeshy.ui.component.media.rememberThumbHashPainter

/**
 * Le fond de la scène du lecteur (iOS `StoryReaderBackground`) : noir sous un vrai média, sinon la couleur ou le
 * dégradé de l'auteur. Il n'est peint que sous le sol et la carte.
 */
@Composable
internal fun StoryReaderBackground(slide: StorySlideView, modifier: Modifier = Modifier) {
    val hasMedia = slide.imageUrl != null || slide.backgroundVideoUrl != null
    val backdrop = StoryReaderFloor.backdrop(hasMedia, slide.background?.serialized())
    val base = when (backdrop) {
        StoryReaderBackdrop.Black -> Modifier.background(Color.Black)
        is StoryReaderBackdrop.Author ->
            Modifier.background(StorySceneFill.resolve(slide.background, slide.accentHex, SceneFloor.AUTHOR_GRADIENT).brush())
    }
    Box(modifier.fillMaxSize().then(base).clearAndSetSemantics { })
}

/**
 * LE SOL : le flou dérivé de l'empreinte (recette partagée avec la galerie et le réel) qui habille l'espace autour
 * de la carte, sous un voile qui suit la carte. Avant l'API 31 (pas de RenderEffect), l'empreinte — déjà lisse — se
 * pose sous un scrim opaque. Sans empreinte, rien : le fond de l'auteur reste visible à travers.
 */
@Composable
internal fun StorySceneFloor(thumbHash: String?, expanded: Boolean, modifier: Modifier = Modifier) {
    val painter = rememberThumbHashPainter(thumbHash) ?: return
    val veil by animateFloatAsState(StoryReaderFloor.veil(expanded), label = "storyFloorVeil")
    val blurs = StoryReaderFloor.supportsBlur(Build.VERSION.SDK_INT)
    Box(modifier.fillMaxSize().clipToBounds().clearAndSetSemantics { }) {
        Image(
            painter = painter,
            contentDescription = null,
            contentScale = ContentScale.Crop,
            alpha = StoryReaderFloor.OPACITY,
            modifier = Modifier
                .fillMaxSize()
                .then(if (blurs) Modifier.blur(StoryReaderFloor.BLUR_RADIUS_DP.dp) else Modifier)
                .graphicsLayer {
                    scaleX = StoryReaderFloor.SCALE
                    scaleY = StoryReaderFloor.SCALE
                },
        )
        if (!blurs) Box(Modifier.fillMaxSize().background(Color.Black.copy(alpha = StoryReaderFloor.FALLBACK_SCRIM_ALPHA)))
        Box(Modifier.fillMaxSize().background(Color.Black.copy(alpha = veil)))
    }
}
