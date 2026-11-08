package me.meeshy.app.chat

import androidx.compose.animation.core.tween
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.asPaddingValues
import androidx.compose.foundation.layout.statusBars
import androidx.compose.runtime.remember
import androidx.compose.ui.input.nestedscroll.NestedScrollConnection
import androidx.compose.ui.input.nestedscroll.nestedScroll
import me.meeshy.sdk.model.reading.focal.FocalMetrics
import me.meeshy.ui.component.focal.ScrollTimePill
import androidx.compose.ui.draw.drawWithContent
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.BlendMode
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.CompositingStrategy
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyListState
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.animation.core.FiniteAnimationSpec
import androidx.compose.animation.core.LinearOutSlowInEasing
import androidx.compose.ui.unit.IntOffset
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.graphics.Color
import me.meeshy.ui.theme.MeeshySpacing

/**
 * The message list engine: the bottom-anchored `LazyColumn` (`reverseLayout = true`, fed the
 * newest-first [renderedItems]) with the floating day pill and the scroll-to-bottom control
 * laid over it. Rows are supplied by [itemContent]; items are keyed by [ChatListItem.key], so
 * scroll position and animations survive inserts exactly as before the split.
 */
@Composable
internal fun ChatMessageList(
    listState: LazyListState,
    renderedItems: List<ChatListItem>,
    accentColor: Color,
    isLoadingOlder: Boolean,
    scrollTimePill: ScrollTimePillState,
    scrollAffordance: ScrollAffordanceState,
    typingParticipants: List<TypingParticipant>,
    isOffline: Boolean,
    onScrollToBottom: () -> Unit,
    scrollConnection: NestedScrollConnection,
    modifier: Modifier = Modifier,
    /** La hauteur de l'en-tête flottant posé au-dessus du fil : les bulles passent dessous. */
    topInset: Dp = 0.dp,
    /** La réserve basse sous laquelle flotte la barre de composition : les bulles passent dessous. */
    bottomInset: Dp = 0.dp,
    itemContent: @Composable (ChatListItem) -> Unit,
) {
    val statusBarHeight = WindowInsets.statusBars.asPaddingValues().calculateTopPadding()
    val rowKeys = remember(renderedItems) { layoutKeys(renderedItems) }
    Box(modifier = modifier) {
        LazyColumn(
            state = listState,
            reverseLayout = true,
            modifier = Modifier
                .fillMaxSize()
                .nestedScroll(scrollConnection)
                .topEdgeVeil(statusBarHeight = statusBarHeight, bandHeight = topInset),
            contentPadding = PaddingValues(top = MeeshySpacing.sm + topInset, bottom = MeeshySpacing.sm + bottomInset),
        ) {
            // Under `reverseLayout`, the HIGHEST Compose item index renders
            // at the visual TOP — so the "loading older history" spinner
            // goes AFTER `items(renderedItems)` (not before, as it did
            // pre-flip) to land above the oldest currently-loaded message.
            itemsIndexed(renderedItems, key = { index, _ -> rowKeys[index] }, contentType = { _, item -> item.contentType }) { _, item ->
                Box(Modifier.fillMaxWidth().animateItem(fadeInSpec = ARRIVAL_SPEC, placementSpec = PLACEMENT_SPEC, fadeOutSpec = ARRIVAL_SPEC)) {
                    itemContent(item)
                }
            }
            if (isLoadingOlder) {
                item(key = "loading-older", contentType = LOADING_OLDER_CONTENT_TYPE) {
                    ChatLoadingOlderIndicator(accentColor)
                }
            }
        }
        ScrollTimePill(
            label = { scrollTimePill.label },
            isVisible = { scrollTimePill.isVisible },
            modifier = Modifier
                .align(Alignment.TopCenter)
                .padding(top = FocalMetrics.Pill.TOP.toFloat().dp),
        )
        ScrollToBottomControl(
            affordance = scrollAffordance,
            typingParticipants = typingParticipants,
            isOffline = isOffline,
            accentColor = accentColor,
            onClick = onScrollToBottom,
            modifier = Modifier
                .align(Alignment.BottomEnd)
                .padding(start = MeeshySpacing.lg, top = MeeshySpacing.lg, end = MeeshySpacing.lg, bottom = MeeshySpacing.lg + bottomInset),
        )
    }
}

/** Le fondu de la pastille de jour flottante (iOS `MessageDayStickyOverlay`, 0,18 s). */
private const val PINNED_DAY_FADE_MS = 180

/**
 * Le fondu du haut du fil, sous la barre d'état et la bande d'en-tête flottante : le contenu qui
 * remonte s'efface en douceur au lieu de passer net sous le retour et les icônes du système
 * (l'effet de bord de défilement d'iOS 26 sous la bande de verre). Transparent sur la barre
 * d'état, il revient à l'opaque au bas de la bande ; au repos le premier message, posé sous la
 * bande par la marge du fil, n'est jamais voilé. Sans bande (fil sous des bandeaux), rien.
 */
private fun Modifier.topEdgeVeil(statusBarHeight: Dp, bandHeight: Dp): Modifier =
    if (bandHeight <= 0.dp) this
    else this
        .graphicsLayer { compositingStrategy = CompositingStrategy.Offscreen }
        .drawWithContent {
            drawContent()
            val band = bandHeight.toPx()
            val bar = statusBarHeight.toPx().coerceAtMost(band)
            drawRect(
                brush = Brush.verticalGradient(
                    0f to Color.Transparent,
                    (bar / band) to Color.Black.copy(alpha = 0.15f),
                    1f to Color.Black,
                    startY = 0f,
                    endY = band,
                ),
                size = Size(size.width, band),
                blendMode = BlendMode.DstIn,
            )
        }

/** L'arrivée d'une bulle : le fondu de 0,18 s des animations non modales d'iOS (`easeOut(0.18)`). */
private val ARRIVAL_SPEC: FiniteAnimationSpec<Float> = tween(PINNED_DAY_FADE_MS, easing = LinearOutSlowInEasing)

/** Les bulles voisines glissent à leur place avec la même durée, jamais d'un saut. */
private val PLACEMENT_SPEC: FiniteAnimationSpec<IntOffset> = tween(PINNED_DAY_FADE_MS, easing = LinearOutSlowInEasing)
