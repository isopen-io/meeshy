package me.meeshy.app.calls

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.snapping.rememberSnapFlingBehavior
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.derivedStateOf
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.snapshotFlow
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.CustomAccessibilityAction
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.customActions
import androidx.compose.ui.semantics.stateDescription
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.filter
import kotlinx.coroutines.launch
import me.meeshy.feature.calls.R
import me.meeshy.sdk.model.call.effects.CallEffectsModeRule
import kotlin.math.abs

private val ITEM = 60.dp
private val SPACING = 14.dp

/**
 * Le carrousel d'un mode (iOS `CallModeCarousel`) : l'élément au CENTRE est choisi. Le nom suit le doigt,
 * le choix ne part qu'au repos (jamais un effet par élément traversé) ; un toucher amène un élément au
 * centre. TalkBack lit un seul élément ajustable : son titre, le choix, et « suivant / précédent ».
 */
@Composable
internal fun <T> CallModeCarousel(
    items: List<T>,
    selection: T,
    title: String,
    name: @Composable (T) -> String,
    glyph: (T) -> String,
    reduceMotion: Boolean,
    onSelect: (T) -> Unit,
) {
    val selectedIndex = items.indexOf(selection).coerceAtLeast(0)
    val list = rememberLazyListState(initialFirstVisibleItemIndex = selectedIndex)
    val scope = rememberCoroutineScope()
    val haptics = LocalHapticFeedback.current
    val latestSelect by rememberUpdatedState(onSelect)
    val latestItems by rememberUpdatedState(items)
    val centred by remember {
        derivedStateOf {
            val layout = list.layoutInfo
            val centre = (layout.viewportStartOffset + layout.viewportEndOffset) / 2
            layout.visibleItemsInfo.minByOrNull { abs(it.offset + it.size / 2 - centre) }?.index
        }
    }

    LaunchedEffect(list) {
        snapshotFlow { list.isScrollInProgress to centred }
            .filter { (scrolling, _) -> !scrolling }
            .distinctUntilChanged()
            .collect { (_, index) ->
                val item = index?.let(latestItems::getOrNull) ?: return@collect
                latestSelect(item)
            }
    }
    LaunchedEffect(selectedIndex) {
        if (centred != selectedIndex && !list.isScrollInProgress) {
            if (reduceMotion) list.scrollToItem(selectedIndex) else list.animateScrollToItem(selectedIndex)
        }
    }

    val shown = centred?.let(items::getOrNull) ?: selection
    val shownName = name(shown)
    val selectedName = name(selection)
    val nextLabel = stringResource(R.string.call_effects_next)
    val previousLabel = stringResource(R.string.call_effects_previous)
    fun step(by: Int): Boolean {
        val next = CallEffectsModeRule.stepping(selection, items, by)
        if (next == selection) return false
        haptics.performHapticFeedback(HapticFeedbackType.TextHandleMove)
        onSelect(next)
        return true
    }

    Column(
        Modifier
            .fillMaxWidth()
            .clearAndSetSemantics {
                contentDescription = title
                stateDescription = selectedName
                customActions = listOf(
                    CustomAccessibilityAction(nextLabel) { step(1) },
                    CustomAccessibilityAction(previousLabel) { step(-1) },
                )
            },
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        Text(shownName, style = MaterialTheme.typography.labelLarge, fontWeight = FontWeight.SemiBold, color = CallPalette.Ink, maxLines = 1)
        BoxWithConstraints(Modifier.fillMaxWidth()) {
            val inset = (maxWidth - ITEM) / 2
            LazyRow(
                state = list,
                flingBehavior = rememberSnapFlingBehavior(list),
                contentPadding = PaddingValues(horizontal = inset),
                horizontalArrangement = Arrangement.spacedBy(SPACING),
                modifier = Modifier.fillMaxWidth(),
            ) {
                itemsIndexed(items) { index, item ->
                    val isShown = index == (centred ?: selectedIndex)
                    Box(
                        contentAlignment = Alignment.Center,
                        modifier = Modifier
                            .size(ITEM)
                            .clip(CircleShape)
                            .background(Color.Black.copy(alpha = if (isShown) 0.45f else 0.3f))
                            .border(if (isShown) 3.dp else 1.dp, Color.White.copy(alpha = if (isShown) 1f else 0.35f), CircleShape)
                            .clickable {
                                scope.launch {
                                    if (reduceMotion) list.scrollToItem(index) else list.animateScrollToItem(index)
                                }
                            },
                    ) {
                        Text(text = glyph(item), fontSize = 26.sp, color = Color.White)
                    }
                }
            }
        }
    }
}
