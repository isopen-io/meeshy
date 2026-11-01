package me.meeshy.app.feed

import androidx.compose.foundation.layout.Box
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clipToBounds
import androidx.compose.ui.layout.Layout
import androidx.compose.ui.unit.Constraints
import kotlin.math.roundToInt
import me.meeshy.sdk.model.SceneFraming
import me.meeshy.sdk.model.SceneRect

/**
 * La fenêtre de cadrage d'une scène (iOS `SceneFocusFrame`, #14199) : la scène 9:16 est mesurée à la taille que [placement]
 * rend pour la boîte reçue, posée au décalage qu'il dit, et le débord rogné. Une mise en page simple, sans sous-composition.
 */
@Composable
private fun SceneFrameLayout(
    modifier: Modifier,
    placement: (width: Double, height: Double) -> SceneFraming.Placement,
    content: @Composable () -> Unit,
) {
    Layout(content = content, modifier = modifier.clipToBounds()) { measurables, constraints ->
        val width = constraints.maxWidth.takeIf { it != Constraints.Infinity } ?: constraints.minWidth
        val height = constraints.maxHeight.takeIf { it != Constraints.Infinity } ?: constraints.minHeight
        val scene = placement(width.toDouble(), height.toDouble())
        val sceneWidth = scene.width.roundToInt().coerceAtLeast(0)
        val sceneHeight = scene.height.roundToInt().coerceAtLeast(0)
        val placeables = measurables.map { it.measure(Constraints.fixed(sceneWidth, sceneHeight)) }
        layout(width, height) { placeables.forEach { it.place(scene.x.roundToInt(), scene.y.roundToInt()) } }
    }
}

/** Une page de carrousel, au rapport de sa zone : [focus] la couvre, à l'échelle de la scène ; sans cadre, la scène entière. */
@Composable
internal fun ScenePageFrame(focus: SceneRect?, modifier: Modifier = Modifier, content: @Composable () -> Unit) {
    if (focus == null || focus.width <= 0.0 || focus.height <= 0.0) {
        Box(modifier) { content() }
        return
    }
    SceneFrameLayout(modifier, { width, height -> SceneFraming.placement(focus, width, height) }, content)
}

/** Une tuile de mosaïque : la scène la couvre et glisse vers [focus] ; sans cadre, le cadrage au centre. */
@Composable
internal fun SceneTileFrame(focus: SceneRect?, modifier: Modifier = Modifier, content: @Composable () -> Unit) {
    SceneFrameLayout(modifier, { width, height -> SceneFraming.tilePlacement(focus, width, height) }, content)
}
