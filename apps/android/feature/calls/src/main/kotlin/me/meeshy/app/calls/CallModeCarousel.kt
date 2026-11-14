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
import androidx.compose.foundation.lazy.LazyListState
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.State
import androidx.compose.runtime.derivedStateOf
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.setValue
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
import androidx.compose.ui.semantics.onClick
import androidx.compose.ui.semantics.stateDescription
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.DpSize
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.filter
import kotlinx.coroutines.launch
import me.meeshy.feature.calls.R
import me.meeshy.sdk.model.call.CallModeCarouselActivation
import me.meeshy.sdk.model.call.CallModeCarouselBrowse
import me.meeshy.sdk.model.call.CallModeCarouselOrdinal
import me.meeshy.sdk.model.call.CallModeCarouselRule
import me.meeshy.sdk.model.call.montage.CallModeGesture
import me.meeshy.sdk.model.call.montage.CallModeGestureOutcome
import me.meeshy.sdk.model.call.montage.CallModeGestureRule
import kotlin.math.abs

private val ITEM = 60.dp
private val SPACING = 14.dp

/** Ce qu'un carrousel déclenche sur son élément centré (#13733) : deux tapes photographient, un appui long filme. */
internal class CallModeShots(val isRecording: Boolean, val onCapturePhoto: () -> Unit, val onStartRecording: () -> Unit)

/**
 * #18192 — les déclinaisons d'un élément (un cadre et ses versions), que TalkBack PARCOURT sans les appliquer : [of] liste
 * l'élément nu puis ses déclinaisons, [current] rend celle qui est posée, [pose] pose celle que l'activation retient.
 */
internal class CallModeVariants<T>(
    val of: (T) -> List<T>,
    val current: (T) -> T,
    val next: String,
    val previous: String,
    val pose: (T) -> Unit,
)

/** Ce que la voix dit de l'élément parcouru : son nom, puis son rang (« Néon, 3 sur 12 »). */
@Composable
private fun spokenValue(announced: String, ordinal: CallModeCarouselOrdinal?): String =
    ordinal?.let { "$announced, ${stringResource(R.string.call_mode_carousel_position, it.rank, it.count)}" } ?: announced

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
    onConfirm: (() -> Unit)? = null,
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
        onConfirm = onConfirm,
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
 * élément : son titre, l'élément parcouru (ou le film en cours), « suivant / précédent » et les deux prises. Un pas
 * « suivant / précédent » PARCOURT sans rien appliquer ni refermer ; seul l'activer (double toucher) choisit l'élément
 * parcouru — un choix, qui ramène la barre au menu de base (C1 généralisée, #18185).
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
    onConfirm: (() -> Unit)? = null,
    variants: CallModeVariants<T>? = null,
    cell: @Composable (item: T, isShown: Boolean) -> Unit,
) {
    val selectedIndex = items.indexOf(selection).coerceAtLeast(0)
    val list = rememberLazyListState(initialFirstVisibleItemIndex = selectedIndex)
    val haptics = LocalHapticFeedback.current
    val centred by rememberCarouselCentre(list, items, selectedIndex, reduceMotion, onSelect)
    val shownName = name(centred?.let(items::getOrNull) ?: selection)
    var browse by remember(selection) { mutableStateOf(CallModeCarouselBrowse<T>()) }
    val position = browse.position(selection)
    val announced = browse.variant?.takeIf { variants != null }?.let { name(it) } ?: name(position)
    val spoken = spokenValue(announced, CallModeCarouselRule.ordinal(position, items))
    val isRecording = shots?.isRecording == true
    val recordingLabel = stringResource(R.string.call_mode_recording)
    val shotActions = rememberShotActions(shots)
    fun moved(next: CallModeCarouselBrowse<T>?): Boolean {
        next ?: return false
        haptics.performHapticFeedback(HapticFeedbackType.TextHandleMove)
        browse = next
        return true
    }
    val variantActions = if (variants != null && variants.of(position).size > 1) {
        listOf(
            CustomAccessibilityAction(variants.next) { moved(browse.stepVariant(1, selection, variants.of, variants.current)) },
            CustomAccessibilityAction(variants.previous) { moved(browse.stepVariant(-1, selection, variants.of, variants.current)) },
        )
    } else {
        emptyList()
    }

    Column(
        modifier
            .fillMaxWidth()
            .clearAndSetSemantics {
                contentDescription = title
                stateDescription = if (isRecording) recordingLabel else spoken
                onClick {
                    val declined = browse.variant
                    val activation = browse.activation(selection, variants?.current ?: { it })
                    browse = browse.leave()
                    when (activation) {
                        is CallModeCarouselActivation.Apply -> if (declined != null) variants?.let { it.pose(activation.item) } else onSelect(activation.item)
                        CallModeCarouselActivation.Confirm -> onConfirm?.invoke()
                    }
                    true
                }
                customActions = listOf(
                    CustomAccessibilityAction(nextLabel) { moved(browse.step(1, items, selection)) },
                    CustomAccessibilityAction(previousLabel) { moved(browse.step(-1, items, selection)) },
                ) + variantActions + shotActions + extraActions
            },
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        Text(shownName, style = MaterialTheme.typography.labelLarge, fontWeight = FontWeight.SemiBold, color = CallPalette.Ink, maxLines = 1)
        hint?.let { Text(it, style = MaterialTheme.typography.labelSmall, color = CallPalette.InkSecondary, maxLines = 1) }
        CarouselRow(
            list = list,
            items = items,
            selection = selection,
            shownIndex = centred ?: selectedIndex,
            size = DpSize(itemWidth, itemHeight),
            spacing = spacing,
            reduceMotion = reduceMotion,
            shots = shots,
            cell = cell,
        )
    }
}

/**
 * L'élément au centre du carrousel, et ce qui le tient : le choix ne part qu'au repos (jamais un effet par élément
 * traversé), et un choix venu d'ailleurs ramène son élément au centre.
 */
@Composable
private fun <T> rememberCarouselCentre(
    list: LazyListState,
    items: List<T>,
    selectedIndex: Int,
    reduceMotion: Boolean,
    onSelect: (T) -> Unit,
): State<Int?> {
    val latestSelect by rememberUpdatedState(onSelect)
    val latestItems by rememberUpdatedState(items)
    val centred = remember(list) {
        derivedStateOf {
            val layout = list.layoutInfo
            val centre = (layout.viewportStartOffset + layout.viewportEndOffset) / 2
            layout.visibleItemsInfo.minByOrNull { abs(it.offset + it.size / 2 - centre) }?.index
        }
    }
    LaunchedEffect(list) {
        snapshotFlow { list.isScrollInProgress to centred.value }
            .filter { (scrolling, _) -> !scrolling }
            .distinctUntilChanged()
            .collect { (_, index) ->
                val item = index?.let(latestItems::getOrNull) ?: return@collect
                latestSelect(item)
            }
    }
    LaunchedEffect(selectedIndex) {
        if (centred.value != selectedIndex && !list.isScrollInProgress) {
            if (reduceMotion) list.scrollToItem(selectedIndex) else list.animateScrollToItem(selectedIndex)
        }
    }
    return centred
}

/** Les deux prises que TalkBack trouve sur l'élément choisi ; aucune pendant un film. */
@Composable
private fun rememberShotActions(shots: CallModeShots?): List<CustomAccessibilityAction> {
    val photoLabel = stringResource(R.string.call_mode_photo)
    val recordLabel = stringResource(R.string.call_mode_record)
    return shots?.takeIf { !it.isRecording }?.let {
        listOf(
            CustomAccessibilityAction(photoLabel) { it.onCapturePhoto(); true },
            CustomAccessibilityAction(recordLabel) { it.onStartRecording(); true },
        )
    }.orEmpty()
}

/** La rangée aimantée : l'élément montré à l'échelle 1, ses voisins plus petits et plus pâles, lus au dessin. */
@Composable
private fun <T> CarouselRow(
    list: LazyListState,
    items: List<T>,
    selection: T,
    shownIndex: Int,
    size: DpSize,
    spacing: Dp,
    reduceMotion: Boolean,
    shots: CallModeShots?,
    cell: @Composable (item: T, isShown: Boolean) -> Unit,
) {
    val scope = rememberCoroutineScope()
    val latestShots by rememberUpdatedState(shots)
    val isRecording = shots?.isRecording == true
    val baseConfiguration = LocalViewConfiguration.current
    val configuration = remember(baseConfiguration) { CaptureViewConfiguration(baseConfiguration) }
    BoxWithConstraints(Modifier.fillMaxWidth()) {
        val inset = CallModeCarouselRule.sideInset(maxWidth.value, size.width.value).dp
        CompositionLocalProvider(LocalViewConfiguration provides configuration) {
            LazyRow(
                state = list,
                flingBehavior = rememberSnapFlingBehavior(list),
                contentPadding = PaddingValues(horizontal = inset),
                horizontalArrangement = Arrangement.spacedBy(spacing),
                verticalAlignment = Alignment.CenterVertically,
                modifier = Modifier.fillMaxWidth().callScrollEdgeFade(horizontal = true),
            ) {
                itemsIndexed(items) { index, item ->
                    val isShown = index == shownIndex
                    val listens = shots != null &&
                        CallModeGestureRule.listensOnTrack(isSelected = item == selection, isCentred = isShown, isRecording = isRecording)
                    val bringToCentre = {
                        scope.launch { if (reduceMotion) list.scrollToItem(index) else list.animateScrollToItem(index) }
                        Unit
                    }
                    Box(
                        contentAlignment = Alignment.Center,
                        modifier = Modifier
                            .size(size)
                            .graphicsLayer {
                                val scale = CallModeCarouselRule.scale(isShown)
                                scaleX = scale
                                scaleY = scale
                                alpha = CallModeCarouselRule.opacity(isShown)
                            }
                            .then(if (listens) shotGestures { latestShots } else Modifier.clickable(onClick = bringToCentre)),
                    ) { cell(item, isShown) }
                }
            }
        }
    }
}

/** Sur l'élément choisi ET centré : deux tapes, la photo ; un appui long, le film. */
private fun shotGestures(shots: () -> CallModeShots?): Modifier = Modifier.pointerInput(Unit) {
    detectTapGestures(
        onDoubleTap = {
            if (shotOutcome(CallModeGesture.DOUBLE_TAP) == CallModeGestureOutcome.CAPTURE_PHOTO) shots()?.onCapturePhoto?.invoke()
        },
        onLongPress = {
            if (shotOutcome(CallModeGesture.LONG_PRESS) == CallModeGestureOutcome.START_RECORDING) shots()?.onStartRecording?.invoke()
        },
    )
}

private fun shotOutcome(gesture: CallModeGesture): CallModeGestureOutcome =
    CallModeGestureRule.outcome(gesture, isSelected = true, isRecording = false)
