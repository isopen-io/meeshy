package me.meeshy.app.stories

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.requiredSize
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clipToBounds
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.hilt.navigation.compose.hiltViewModel
import me.meeshy.sdk.model.StoryItem

/**
 * La loi de cadrage de la scène d'un réel (iOS `ReelCardSceneBackdrop` : `.aspectRatio(SceneShape.aspect, contentMode: .fill)`) : la
 * scène garde son 9:16 et COUVRE le cadre de la carte, rognée au centre — jamais une bande 9:16 centrée qui laisse des marges.
 */
internal object SceneAspectFill {

    data class Size(val width: Float, val height: Float)

    private const val ASPECT = 9f / 16f

    fun cover(width: Float, height: Float): Size {
        if (width <= 0f || height <= 0f) return Size(0f, 0f)
        return if (width / height >= ASPECT) Size(width, width / ASPECT) else Size(height * ASPECT, height)
    }
}

/**
 * La scène d'un réel composé sur sa carte (iOS `ReelCardSceneBackdrop`) : la même projection et le même lecteur que le lecteur de
 * stories, mais la scène REMPLIT le cadre reçu (sur du noir, rognée au centre), muette, sans geste ni libellé — la carte qui la porte
 * ouvre le réel et se lit « Réel de … ». Elle ne joue que quand le fil l'élit ([live]) ; sinon c'est une image fixe, sans lecteur (#13663).
 */
@Composable
fun ReelCardScene(
    item: StoryItem,
    accentHex: String?,
    live: Boolean,
    modifier: Modifier = Modifier,
    viewModel: RepostSceneViewModel = hiltViewModel(),
) {
    val slide = remember(item, accentHex) { viewModel.slideOf(item, accentHex = accentHex ?: SCENE_FALLBACK_ACCENT) }
    val density = LocalDensity.current
    BoxWithConstraints(
        modifier = modifier.clipToBounds().background(Color.Black).clearAndSetSemantics { },
        contentAlignment = Alignment.Center,
    ) {
        val frame = SceneAspectFill.cover(constraints.maxWidth.toFloat(), constraints.maxHeight.toFloat())
        StoryScenePlayer(
            slide = slide,
            playing = live,
            muted = true,
            loads = true,
            rewindWhenIdle = false,
            resting = !live,
            modifier = with(density) { Modifier.requiredSize(frame.width.toDp(), frame.height.toDp()) },
        )
    }
}

private const val SCENE_FALLBACK_ACCENT = "6366F1"
