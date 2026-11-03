package me.meeshy.app.stories

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.FastOutSlowInEasing
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.scaleIn
import androidx.compose.animation.scaleOut
import androidx.compose.foundation.layout.BoxScope
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.wrapContentSize
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.State
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateMapOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Rect
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.hapticfeedback.HapticFeedback
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.layout.onSizeChanged
import androidx.compose.ui.unit.Density
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlin.math.roundToInt
import kotlinx.coroutines.delay
import me.meeshy.ui.component.EmojiQuickStrip
import me.meeshy.ui.component.LanguageQuickOption
import me.meeshy.ui.component.LanguageQuickStrip

/**
 * Propriétaire : lot story-viewer-decomposition-and-nav-graph. Tout ce qui flotte à côté du rail d'actions :
 * le contrôleur de balayage (cœur et langues), les deux barres ancrées, le vol d'un emoji vers le cœur.
 * Un lot qui ajoute une barre ou un geste de rail étend CE fichier ; l'état de balayage n'entre pas dans
 * `StoryViewerUiState`.
 */
@androidx.compose.runtime.Stable
internal class StoryRailController(
    private val state: State<StoryViewerUiState>,
    private val viewModel: StoryViewerViewModel,
    private val haptics: HapticFeedback,
    private val density: Density,
) {
    var scrubKind by mutableStateOf<StoryScrubKind?>(null)
    var reactionBarVisible by mutableStateOf(false)
    var languageBarVisible by mutableStateOf(false)
    var hoveredIndex by mutableStateOf<Int?>(null)
    val reactionTileBounds = mutableStateMapOf<Int, Rect>()
    val languageTileBounds = mutableStateMapOf<Int, Rect>()
    var heartBounds by mutableStateOf<Rect?>(null)
    var languageButtonBounds by mutableStateOf<Rect?>(null)
    var showFullEmojiPicker by mutableStateOf(false)
    var reactionFlight by mutableStateOf<ReactionFlight?>(null)
    var heartBouncePulse by mutableIntStateOf(0)
    var boxOriginInRoot by mutableStateOf(Offset.Zero)
    private var flightSerial by mutableIntStateOf(0)

    val overlayActive: Boolean get() = reactionBarVisible || languageBarVisible || scrubKind != null

    fun closeBars() {
        reactionBarVisible = false
        languageBarVisible = false
        hoveredIndex = null
    }

    fun toggleLanguageBar() {
        reactionBarVisible = false
        hoveredIndex = null
        languageBarVisible = !languageBarVisible
    }

    fun openFullPicker() {
        closeBars()
        showFullEmojiPicker = true
    }

    fun sendReaction(emoji: String, from: Rect?) {
        haptics.performHapticFeedback(HapticFeedbackType.LongPress)
        viewModel.react(emoji)
        closeBars()
        val target = heartBounds
        if (from != null && target != null) {
            flightSerial++
            reactionFlight = ReactionFlight(emoji = emoji, from = from, serial = flightSerial)
        } else {
            heartBouncePulse++
        }
    }

    fun handleScrub(event: StoryScrubEvent) {
        when (event) {
            is StoryScrubEvent.Started -> onScrubStarted(event.kind)
            is StoryScrubEvent.Moved -> onScrubMoved(event)
            StoryScrubEvent.Ended -> onScrubEnded()
            StoryScrubEvent.Cancelled -> {
                scrubKind = null
                closeBars()
            }
        }
    }

    private fun onScrubStarted(kind: StoryScrubKind) {
        haptics.performHapticFeedback(HapticFeedbackType.LongPress)
        scrubKind = kind
        when (kind) {
            StoryScrubKind.Reactions -> {
                reactionBarVisible = true
                languageBarVisible = false
            }
            StoryScrubKind.Languages -> {
                languageBarVisible = true
                reactionBarVisible = false
            }
        }
        hoveredIndex = null
    }

    private fun onScrubMoved(event: StoryScrubEvent.Moved) {
        val bounds = when (scrubKind) {
            StoryScrubKind.Reactions -> reactionTileBounds
            StoryScrubKind.Languages -> languageTileBounds
            null -> return
        }
        val tolerance = with(density) { 16.dp.toPx() }
        val next = ScrubHitResolver.hoveredIndex(bounds, event.rootPosition, tolerance)
        if (next != hoveredIndex) {
            haptics.performHapticFeedback(HapticFeedbackType.TextHandleMove)
        }
        hoveredIndex = next
    }

    private fun onScrubEnded() {
        val kind = scrubKind
        val hovered = hoveredIndex
        scrubKind = null
        hoveredIndex = null
        when (kind) {
            StoryScrubKind.Reactions -> when (val release = ScrubHitResolver.release(hovered, state.value.quickReactions)) {
                is ScrubRelease.React -> sendReaction(release.emoji, from = reactionTileBounds[hovered])
                ScrubRelease.Expand -> openFullPicker()
                ScrubRelease.KeepOpen -> Unit
            }
            StoryScrubKind.Languages -> {
                val options = state.value.availableLanguages
                if (hovered != null && hovered in options.indices) {
                    haptics.performHapticFeedback(HapticFeedbackType.LongPress)
                    viewModel.toggleLanguageOverride(options[hovered].code)
                    closeBars()
                } else if (hovered != null && hovered == options.size) {
                    haptics.performHapticFeedback(HapticFeedbackType.LongPress)
                    closeBars()
                    viewModel.openLanguageExplorer()
                }
            }
            null -> Unit
        }
    }
}

/**
 * A reaction emoji flying from its (scaled) bar tile to the heart button.
 * [serial] is a monotonic tie-breaker so reacting again with the same emoji
 * from the same tile within the flight window is still a distinct value
 * (structural equality would otherwise make the state write a no-op).
 */
internal data class ReactionFlight(val emoji: String, val from: Rect, val serial: Int)

/** Les deux barres ancrées au rail (réactions, langues) et le vol d'un emoji choisi vers le cœur. */
@Composable
internal fun BoxScope.StoryRailBars(
    rail: StoryRailController,
    state: StoryViewerUiState,
    viewModel: StoryViewerViewModel,
) {
    val languageBadge = state.activeLanguageCode
    RailAnchoredBar(
        visible = rail.reactionBarVisible || rail.scrubKind == StoryScrubKind.Reactions,
        anchor = rail.heartBounds?.translate(-rail.boxOriginInRoot),
    ) {
        EmojiQuickStrip(
            emojis = state.quickReactions,
            onReact = { emoji ->
                rail.sendReaction(emoji, from = rail.reactionTileBounds[state.quickReactions.indexOf(emoji)])
            },
            ownReactions = state.myReactions,
            onExpand = rail::openFullPicker,
            highlightedIndex = if (rail.scrubKind == StoryScrubKind.Reactions) rail.hoveredIndex else null,
            onTileBounds = { index, rect -> rail.reactionTileBounds[index] = rect },
        )
    }

    RailAnchoredBar(
        visible = rail.languageBarVisible || rail.scrubKind == StoryScrubKind.Languages,
        anchor = rail.languageButtonBounds?.translate(-rail.boxOriginInRoot),
    ) {
        LanguageQuickStrip(
            options = state.availableLanguages.map {
                LanguageQuickOption(
                    code = it.code,
                    flag = it.flag,
                    label = it.label,
                    isTranslatable = it.isTranslatable,
                    isTranslating = it.isTranslating,
                )
            },
            onSelect = { option ->
                if (option.isTranslatable) {
                    viewModel.requestStoryTranslation(option.code)
                } else {
                    viewModel.toggleLanguageOverride(option.code)
                    rail.closeBars()
                }
            },
            activeCode = languageBadge,
            highlightedIndex = if (rail.scrubKind == StoryScrubKind.Languages) rail.hoveredIndex else null,
            onTileBounds = { index, rect -> rail.languageTileBounds[index] = rect },
            onOpenAll = {
                rail.closeBars()
                viewModel.openLanguageExplorer()
            },
        )
    }

    val flight = rail.reactionFlight
    val flightTarget = rail.heartBounds
    if (flight != null && flightTarget != null) {
        ReactionFlightOverlay(
            flight = flight.copy(from = flight.from.translate(-rail.boxOriginInRoot)),
            target = flightTarget.translate(-rail.boxOriginInRoot),
            onArrived = { rail.heartBouncePulse++ },
            onFinished = { rail.reactionFlight = null },
        )
    }
}

/**
 * Positions a scrubbable bar to the LEFT of its rail button, vertically
 * centred on it — the Android mirror of the iOS `.overlay(alignment:
 * .trailing) + .offset(x: -56)` anchoring. Enters/leaves with a fast
 * (~120 ms) fade+scale so a selected reaction clears the bar before the
 * flight animation starts (spec: bar must vanish quickly).
 */
@Composable
private fun BoxScope.RailAnchoredBar(
    visible: Boolean,
    anchor: Rect?,
    content: @Composable () -> Unit,
) {
    var barHeight by remember { mutableIntStateOf(0) }
    AnimatedVisibility(
        visible = visible,
        enter = fadeIn(tween(120)) + scaleIn(initialScale = 0.8f, animationSpec = tween(120)),
        exit = fadeOut(tween(120)) + scaleOut(targetScale = 0.8f, animationSpec = tween(120)),
        modifier = Modifier
            .align(Alignment.TopEnd)
            .padding(end = 76.dp)
            .offset {
                val centerY = anchor?.center?.y ?: 0f
                IntOffset(x = 0, y = (centerY - barHeight / 2f).roundToInt().coerceAtLeast(0))
            }
            .onSizeChanged { barHeight = it.height },
    ) {
        content()
    }
}

/**
 * The chosen emoji flying from its scaled bar tile to the heart button:
 * position tween ~450 ms while shrinking 1.35 -> 0.5; on arrival the heart
 * bounces (bouncy spring, via [onArrived] -> heartBouncePulse) and the
 * overlay clears ~300 ms later. Total stays under the 1 s budget.
 */
@Composable
private fun ReactionFlightOverlay(
    flight: ReactionFlight,
    target: Rect,
    onArrived: () -> Unit,
    onFinished: () -> Unit,
) {
    val progress = remember(flight) { Animatable(0f) }
    LaunchedEffect(flight) {
        progress.animateTo(1f, tween(durationMillis = 450, easing = FastOutSlowInEasing))
        onArrived()
        delay(300)
        onFinished()
    }
    val from = flight.from.center
    val to = target.center
    val emojiSize = 36.dp
    Text(
        text = flight.emoji,
        fontSize = 22.sp,
        modifier = Modifier
            .offset {
                val t = progress.value
                val x = from.x + (to.x - from.x) * t
                val y = from.y + (to.y - from.y) * t
                val half = (emojiSize.toPx() / 2f)
                IntOffset((x - half).roundToInt(), (y - half).roundToInt())
            }
            .size(emojiSize)
            .graphicsLayer {
                val scale = 1.35f + (0.5f - 1.35f) * progress.value
                scaleX = scale
                scaleY = scale
            }
            .wrapContentSize(Alignment.Center),
    )
}
