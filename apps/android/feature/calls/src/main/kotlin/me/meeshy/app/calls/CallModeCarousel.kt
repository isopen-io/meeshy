package me.meeshy.app.calls

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.detectTapGestures
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
import androidx.compose.runtime.CompositionLocalProvider
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
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.platform.LocalViewConfiguration
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.CustomAccessibilityAction
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.customActions
import androidx.compose.ui.semantics.stateDescription
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.filter
import kotlinx.coroutines.launch
import me.meeshy.feature.calls.R
import me.meeshy.sdk.model.call.effects.CallEffectsModeRule
import me.meeshy.sdk.model.call.montage.CallModeGesture
import me.meeshy.sdk.model.call.montage.CallModeGestureOutcome
import me.meeshy.sdk.model.call.montage.CallModeGestureRule
import kotlin.math.abs

private val ITEM = 60.dp
private val SPACING = 14.dp
private const val NEIGHBOUR_SCALE = 0.78f
private const val NEIGHBOUR_ALPHA = 0.6f

/** Ce qu'un carrousel déclenche sur son élément centré (#13733) : deux tapes photographient, un appui long filme. */
internal class CallModeShots(val isRecording: Boolean, val onCapturePhoto: () -> Unit, val onStartRecording: () -> Unit)

/** Le carrousel des effets : un glyphe rond par élément ; avec [shots], l'effet centré se photographie et se filme (#13737). */
@Composable
internal fun <T> CallModeCarousel(
    items: List<T>,
    selection: T,
    title: String,
    name: @Composable (T) -> String,
    glyph: (T) -> String,
    reduceMotion: Boolean,
    onSelect: (T) -> Unit,
    hint: String? = null,
    shots: CallModeShots? = null,
) {
    CallModeCarousel(
        items = items,
        selection = selection,
        title = title,
        name = name,
        reduceMotion = reduceMotion,
        onSelect = onSelect,
        nextLabel = stringResource(R.string.call_effects_next),
        previousLabel = stringResource(R.string.call_effects_previous),
        hint = hint,
        shots = shots,
    ) { item, isShown ->
        Box(
            contentAlignment = Alignment.Center,
            modifier = Modifier
                .size(ITEM)
                .clip(CircleShape)
                .background(Color.Black.copy(alpha = if (isShown) 0.45f else 0.3f))
                .border(if (isShown) 3.dp else 1.dp, Color.White.copy(alpha = if (isShown) 1f else 0.35f), CircleShape),
        ) {
            Text(text = glyph(item), fontSize = 26.sp, color = Color.White)
        }
    }
}

/**
 * Le carrousel d'un mode (iOS `CallModeCarousel`) : l'élément au CENTRE est choisi, aimanté au repos. Le nom suit
 * le doigt, le choix ne part qu'au repos (jamais un effet par élément traversé) ; un toucher amène un élément au
 * centre. Avec [shots], l'élément choisi ET centré se déclenche : deux tapes, la photo ; un appui long, le film
 * (`CallModeGestureRule.listensOnTrack`). Les voisins sont plus petits et plus pâles. TalkBack lit un seul
 * élément : son titre, le choix (ou le film en cours), « suivant / précédent » et les deux prises.
 */
@Composable
internal fun <T> CallModeCarousel(
    items: List<T>,
    selection: T,
    title: String,
    name: @Composable (T) -> String,
    reduceMotion: Boolean,
    onSelect: (T) -> Unit,
    nextLabel: String,
    previousLabel: String,
    modifier: Modifier = Modifier,
    itemWidth: Dp = ITEM,
    itemHeight: Dp = ITEM,
    spacing: Dp = SPACING,
    hint: String? = null,
    shots: CallModeShots? = null,
    extraActions: List<CustomAccessibilityAction> = emptyList(),
    cell: @Composable (item: T, isShown: Boolean) -> Unit,
) {
    val selectedIndex = items.indexOf(selection).coerceAtLeast(0)
    val list = rememberLazyListState(initialFirstVisibleItemIndex = selectedIndex)
    val scope = rememberCoroutineScope()
    val haptics = LocalHapticFeedback.current
    val latestSelect by rememberUpdatedState(onSelect)
    val latestItems by rememberUpdatedState(items)
    val latestShots by rememberUpdatedState(shots)
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
    val isRecording = shots?.isRecording == true
    val recordingLabel = stringResource(R.string.call_mode_recording)
    val photoLabel = stringResource(R.string.call_mode_photo)
    val recordLabel = stringResource(R.string.call_mode_record)
    fun step(by: Int): Boolean {
        val next = CallEffectsModeRule.stepping(selection, items, by)
        if (next == selection) return false
        haptics.performHapticFeedback(HapticFeedbackType.TextHandleMove)
        onSelect(next)
        return true
    }
    val shotActions = shots?.takeIf { !it.isRecording }?.let {
        listOf(
            CustomAccessibilityAction(photoLabel) { it.onCapturePhoto(); true },
            CustomAccessibilityAction(recordLabel) { it.onStartRecording(); true },
        )
    }.orEmpty()
    val baseConfiguration = LocalViewConfiguration.current
    val configuration = remember(baseConfiguration) { CaptureViewConfiguration(baseConfiguration) }

    Column(
        modifier
            .fillMaxWidth()
            .clearAndSetSemantics {
                contentDescription = title
                stateDescription = if (isRecording) recordingLabel else selectedName
                customActions = listOf(
                    CustomAccessibilityAction(nextLabel) { step(1) },
                    CustomAccessibilityAction(previousLabel) { step(-1) },
                ) + shotActions + extraActions
            },
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        Text(shownName, style = MaterialTheme.typography.labelLarge, fontWeight = FontWeight.SemiBold, color = CallPalette.Ink, maxLines = 1)
        hint?.let { Text(it, style = MaterialTheme.typography.labelSmall, color = CallPalette.InkSecondary, maxLines = 1) }
        BoxWithConstraints(Modifier.fillMaxWidth()) {
            val inset = (maxWidth - itemWidth) / 2
            CompositionLocalProvider(LocalViewConfiguration provides configuration) {
                LazyRow(
                    state = list,
                    flingBehavior = rememberSnapFlingBehavior(list),
                    contentPadding = PaddingValues(horizontal = inset),
                    horizontalArrangement = Arrangement.spacedBy(spacing),
                    verticalAlignment = Alignment.CenterVertically,
                    modifier = Modifier.fillMaxWidth(),
                ) {
                    itemsIndexed(items) { index, item ->
                        val isShown = index == (centred ?: selectedIndex)
                        val listens = shots != null &&
                            CallModeGestureRule.listensOnTrack(isSelected = item == selection, isCentred = isShown, isRecording = isRecording)
                        val bringToCentre = {
                            scope.launch { if (reduceMotion) list.scrollToItem(index) else list.animateScrollToItem(index) }
                            Unit
                        }
                        val gestures = if (listens) {
                            Modifier.pointerInput(Unit) {
                                detectTapGestures(
                                    onDoubleTap = {
                                        if (shotOutcome(CallModeGesture.DOUBLE_TAP) == CallModeGestureOutcome.CAPTURE_PHOTO) latestShots?.onCapturePhoto?.invoke()
                                    },
                                    onLongPress = {
                                        if (shotOutcome(CallModeGesture.LONG_PRESS) == CallModeGestureOutcome.START_RECORDING) latestShots?.onStartRecording?.invoke()
                                    },
                                )
                            }
                        } else {
                            Modifier.clickable(onClick = bringToCentre)
                        }
                        Box(
                            contentAlignment = Alignment.Center,
                            modifier = Modifier
                                .size(itemWidth, itemHeight)
                                .graphicsLayer {
                                    val scale = if (isShown) 1f else NEIGHBOUR_SCALE
                                    scaleX = scale
                                    scaleY = scale
                                    alpha = if (isShown) 1f else NEIGHBOUR_ALPHA
                                }
                                .then(gestures),
                        ) { cell(item, isShown) }
                    }
                }
            }
        }
    }
}

private fun shotOutcome(gesture: CallModeGesture): CallModeGestureOutcome =
    CallModeGestureRule.outcome(gesture, isSelected = true, isRecording = false)
