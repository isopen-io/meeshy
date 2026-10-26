package me.meeshy.app.chat

import androidx.compose.animation.core.FastOutSlowInEasing
import androidx.compose.animation.core.LinearOutSlowInEasing
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.tween
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.lazy.LazyListState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.derivedStateOf
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.snapshotFlow
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.unit.dp
import androidx.compose.ui.zIndex
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.collectLatest
import kotlinx.coroutines.launch
import me.meeshy.sdk.model.reading.focal.FocalMetrics
import me.meeshy.sdk.model.reading.focal.FocalScrollPerspective

/**
 * Le moteur de la scène Focal : il lit la géométrie du `LazyColumn` (renversé) à chaque image
 * d'un défilement du DOIGT et la confie à [FocalSceneState] ; à l'arrêt de l'élan il pose les
 * détails de l'élu, puis aplatit la scène après `REST_DELAY` (4,5 s). Hors Focal : tout à plat.
 */
@Composable
internal fun FocalSceneDriver(
    enabled: Boolean,
    scene: FocalSceneState,
    listState: LazyListState,
    renderedItems: List<ChatListItem>,
    chrome: ChatChromeState,
    reduceMotion: Boolean,
) {
    val density = LocalDensity.current
    val items by rememberUpdatedState(renderedItems)
    val reduce by rememberUpdatedState(reduceMotion)
    LaunchedEffect(enabled, scene, listState) {
        if (!enabled) {
            scene.flatten()
            return@LaunchedEffect
        }
        var scrolledDp = 0.0
        var previous: Map<Any, Int> = emptyMap()
        fun frame(): FocalFrame? {
            val info = listState.layoutInfo
            val visible = info.visibleItemsInfo
            if (visible.isEmpty()) return null
            val d = density.density.toDouble()
            // La distance défilée : le déplacement d'une rangée présente aux deux images.
            val current = visible.associate { it.key to it.offset }
            previous.entries.firstOrNull { current.containsKey(it.key) }?.let { (key, offset) ->
                scrolledDp += (current.getValue(key) - offset) / d
            }
            previous = current
            val rendered = items
            val height = info.viewportSize.height.toDouble()
            val before = info.beforeContentPadding.toDouble()
            // `reverseLayout` : l'offset court depuis le bas du fil, après la réserve basse.
            val cells = visible.filter { it.index < rendered.size }.map { item ->
                val bottom = height - before - item.offset
                FocalScrollPerspective.CellGeometry(
                    id = item.key.toString(),
                    visualMidY = (bottom - item.size / 2.0) / d,
                    height = item.size / d,
                    isMessage = rendered[item.index] is ChatListItem.Message,
                )
            }
            val offsetFromBottom = if (listState.firstVisibleItemIndex == 0) {
                listState.firstVisibleItemScrollOffset / d
            } else {
                Double.MAX_VALUE
            }
            val groupHeads = rendered.asSequence()
                .filterIsInstance<ChatListItem.Message>()
            return FocalFrame(
                nowMs = System.nanoTime() / 1_000_000.0,
                scrolledDp = scrolledDp,
                cells = cells,
                focusY = FocalScrollPerspective.focusY(
                    visibleTop = info.afterContentPadding / d,
                    visibleBottom = (height - before) / d,
                    offsetFromBottom = offsetFromBottom,
                ),
                rowWidth = info.viewportSize.width / d,
                reduceMotion = reduce,
                isFirstInGroup = { id -> groupHeads.firstOrNull { it.key == id }?.bubble?.isFirstInGroup ?: true },
            )
        }
        launch {
            snapshotFlow { listState.layoutInfo }.collect {
                if (chrome.isUserScrolling) frame()?.let(scene::tick)
            }
        }
        snapshotFlow { chrome.isUserScrolling }.collectLatest { scrolling ->
            if (scrolling || !scene.isActive) return@collectLatest
            scene.settle(frame())
            delay(FocalMetrics.Scene.REST_DELAY_MS)
            scene.flatten()
        }
    }
}

/**
 * Une rangée du fil en Focal : élue, elle passe devant ses voisines (son cadre déborde sur
 * elles) ; voisine, elle s'écarte du passage de l'élue (`electionShift`) par translation seule —
 * aucune hauteur ne change —, en 250 ms ease-out, et rejoint sa place en 450 ms à l'aplatissement.
 */
@Composable
internal fun FocalPassageItem(
    key: Any,
    scene: FocalSceneState,
    renderedIndexOf: Map<Any, Int>,
    content: @Composable (elected: Boolean) -> Unit,
) {
    val elected by remember(key, scene) { derivedStateOf { scene.detailedId == key.toString() } }
    val target by remember(key, scene, renderedIndexOf) {
        derivedStateOf {
            val passage = scene.passage ?: return@derivedStateOf 0f
            if (passage.anchorId == key.toString()) return@derivedStateOf 0f
            val mine = renderedIndexOf[key] ?: return@derivedStateOf 0f
            val anchor = renderedIndexOf[passage.anchorId] ?: return@derivedStateOf 0f
            // Liste renversée : un indice plus grand se dessine AU-DESSUS de l'élue.
            if (mine > anchor) -passage.above.toFloat() else passage.below.toFloat()
        }
    }
    val shift by animateFloatAsState(
        targetValue = target,
        animationSpec = if (scene.isFlattening) {
            tween(FocalMetrics.Scene.FLATTEN_DURATION_MS.toInt(), easing = FastOutSlowInEasing)
        } else {
            tween(FocalMetrics.Scene.ENTER_DURATION_MS.toInt(), easing = LinearOutSlowInEasing)
        },
        label = "focal-passage",
    )
    Column(
        Modifier
            .zIndex(if (elected) 1f else 0f)
            .graphicsLayer { translationY = shift.dp.toPx() },
    ) { content(elected) }
}
