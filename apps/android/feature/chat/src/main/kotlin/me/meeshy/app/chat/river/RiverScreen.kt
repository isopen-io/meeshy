package me.meeshy.app.chat.river

import androidx.compose.foundation.background
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.State
import androidx.compose.runtime.derivedStateOf
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.setValue
import androidx.compose.runtime.snapshotFlow
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.onGloballyPositioned
import androidx.compose.ui.layout.positionInWindow
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.LocalLayoutDirection
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.LayoutDirection
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.collectLatest
import kotlinx.coroutines.flow.drop
import kotlinx.coroutines.withContext
import me.meeshy.app.chat.ChatHostContext
import me.meeshy.app.chat.TypingIndicator
import me.meeshy.sdk.model.reading.mode.ConversationReadingMode
import me.meeshy.sdk.model.reading.river.RiverColumnLayout
import me.meeshy.sdk.model.reading.river.RiverConversationMapping
import me.meeshy.sdk.model.reading.river.RiverCursor
import me.meeshy.sdk.model.reading.river.RiverLaneHeaders
import me.meeshy.sdk.model.reading.river.ResolveRiverLaneHeadersInput
import me.meeshy.sdk.model.reading.river.RiverMetrics
import me.meeshy.sdk.model.reading.river.RiverTimeScale
import me.meeshy.ui.accessibility.LocalReduceMotion
import me.meeshy.ui.component.StoryRingState
import me.meeshy.ui.haptics.rememberMeeshyHaptics
import me.meeshy.ui.profile.LocalProfileSheetOpener
import me.meeshy.ui.theme.MeeshyTheme

/** Le balayage vaut un pas à partir de 40 dp (iOS `DragGesture(minimumDistance: 40)`). */
private val SWIPE_THRESHOLD = 40.dp

/**
 * L'écran Rivière : la loi (`RiverGeometry`), les cotes (`RiverMetrics`) et les feuilles — toile,
 * bulles, bande des couloirs, poignée du temps — assemblées en une grille défilable à deux axes. Une
 * surcouche opaque posée SUR le fil, qui reste composé dessous : y entrer et en sortir ne perd aucune
 * position, ni celle du fil ni celle de la Rivière ([pane] est hissé au-dessus de la surcouche).
 *
 * **Les images tiennent à 60 fps** parce que rien ne se recompose au défilement : la toile lit la
 * pile à la phase de DESSIN, la bande des couloirs se translate à la phase de LAYOUT, la poignée lit
 * sa visibilité à la phase de dessin, et la hauteur de lecture n'est qu'un `derivedStateOf` qui
 * n'émet qu'au changement de rang. Le rendu (présence lue au pied de l'avatar, Prisme déjà servi)
 * est mémoïsé par `remember` sur ses seules entrées.
 */
@Composable
internal fun RiverScreen(
    host: ChatHostContext,
    pane: RiverPaneState,
    topInset: Dp,
    bottomInset: Dp,
    modifier: Modifier = Modifier,
) {
    val state = host.state
    val bubbles = state.messages
    val reduceMotion = LocalReduceMotion.current
    val haptics = rememberMeeshyHaptics()
    val profileOpener = LocalProfileSheetOpener.current
    val isRtl = LocalLayoutDirection.current == LayoutDirection.Rtl

    val viewerId = remember(bubbles) { RiverThreadMapping.viewerId(bubbles) }
    val geometryKey = remember(bubbles, viewerId) {
        RiverConversationMapping.fingerprint(RiverThreadMapping.messages(bubbles)) to viewerId
    }
    val latestBubbles = rememberUpdatedState(bubbles)
    // La loi se résout HORS du fil principal, une fois par empreinte ; le curseur survit (ou se recale).
    LaunchedEffect(geometryKey) {
        if (pane.geometryKey == geometryKey) return@LaunchedEffect
        val next = withContext(Dispatchers.Default) { RiverThreadMapping.geometry(latestBubbles.value) }
        pane.accept(next, geometryKey)
    }
    val geometry = pane.geometry
    val rendering = remember(geometry, bubbles) {
        RiverRenderingBuilder.build(geometry, bubbles, storyRing = { StoryRingState.None })
    }
    val latestRendering = rememberUpdatedState(rendering)

    val edgeBefore = remember { pane.edgeBounceToken }
    LaunchedEffect(pane.edgeBounceToken) { if (pane.edgeBounceToken != edgeBefore) haptics.light() }

    val windowOrigin = remember { floatArrayOf(0f, 0f) }
    val density = LocalDensity.current
    val swipePx = with(density) { SWIPE_THRESHOLD.toPx() }
    val actions = remember(pane, host, profileOpener, reduceMotion, density) {
        RiverBubbleActions(
            onTap = { id ->
                latestRendering.value.contentByMessageId[id]?.bubble?.let { pane.moveTo(RiverCursor(it.laneIndex, it.rank)) }
            },
            onLongPress = { id ->
                publishFrame(id, latestRendering.value, pane, windowOrigin, host, density)
                haptics.medium()
                host.actions.onMessageLongPress(id)
            },
            onOpenReply = { target -> pane.landOnMessage(target, animated = !reduceMotion) },
            onOpenProfile = profileOpener::open,
            onOpenInThread = { id ->
                host.readingMode?.select(ConversationReadingMode.SCRIPT)
                host.actions.scrollToMessage(id)
            },
        )
    }

    BoxWithConstraints(
        modifier
            .fillMaxSize()
            .background(MeeshyTheme.tokens.backgroundPrimary)
            .onGloballyPositioned { windowOrigin.assign(it.positionInWindow()) }
            // Le volet possède sa surface : sans cela, les zones vides laissaient passer les touches jusqu'au fil dessous.
            .pointerInput(Unit) {}
            .riverGestures(
                swipeThresholdPx = swipePx,
                isRtl = isRtl,
                onStep = pane::step,
                onPinchBegan = pane::pinchBegan,
                onPinch = pane::pinch,
            ),
    ) {
        val laneWidthDp = pane.laneWidthDp
        val columns = remember(laneWidthDp, geometry.laneCount) {
            RiverColumnLayout(laneWidthDp.toDouble(), RiverMetrics.Lane.GUTTER, geometry.laneCount.coerceAtLeast(1))
        }
        val metrics = with(density) {
            RiverPaneMetrics(
                widthPx = constraints.maxWidth.toFloat(),
                heightPx = constraints.maxHeight.toFloat(),
                headerInsetPx = topInset.toPx(),
                bottomInsetPx = bottomInset.toPx(),
                laneHeaderPx = RiverMetrics.LaneHeader.HEIGHT.dp.toPx(),
                gutterPx = RiverMetrics.Lane.GUTTER.dp.toPx(),
                rowGapPx = RiverMetrics.Row.GAP.dp.toPx(),
            )
        }
        val latestMetrics = rememberUpdatedState(metrics)

        // Un cadrage est une DEMANDE : elle tient jusqu'à ce que le volet, mesuré, l'ait honorée.
        val request = pane.landing
        LaunchedEffect(request, metrics.heightPx > 0f, geometry.rankCount) {
            if (request == null || metrics.heightPx <= 0f || geometry.rankCount == 0) return@LaunchedEffect
            pane.frame(request.copy(animated = request.animated && !reduceMotion), latestMetrics.value, with(density) { laneWidthDp.dp.toPx() })
            pane.consume(request)
        }

        val focusRank = rememberFocusRank(pane, rendering, metrics)

        RiverLaneCanvas(
            rendering = rendering,
            listState = pane.listState,
            horizontal = pane.horizontal,
            laneWidthDp = laneWidthDp,
            topExclusionDp = topInset.value + RiverMetrics.LaneHeader.HEIGHT.toFloat(),
            modifier = Modifier.fillMaxSize(),
        )
        Box(Modifier.fillMaxSize().horizontalScroll(pane.horizontal)) {
            RiverStream(rendering, columns, pane, topInset, bottomInset, actions)
        }
        HeadersLayer(
            focusRank = focusRank,
            rendering = rendering,
            laneWidthDp = laneWidthDp,
            pane = pane,
            modifier = Modifier.align(Alignment.TopStart).padding(top = topInset),
        )
        rendering.timeScale?.let { scale ->
            HandleLayer(
                scale = scale,
                focusRank = focusRank,
                pane = pane,
                rendering = rendering,
                reduceMotion = reduceMotion,
                modifier = Modifier
                    .align(Alignment.TopEnd)
                    .padding(top = topInset + RiverMetrics.LaneHeader.HEIGHT.dp, bottom = bottomInset),
            )
        }
        Box(Modifier.align(Alignment.BottomStart).padding(bottom = bottomInset)) {
            TypingIndicator(participants = state.typingParticipants)
        }
    }
}

/** La pile paresseuse : une cale haute (en-tête + bande des couloirs), une rangée par rang, une cale basse. */
@Composable
private fun RiverStream(
    rendering: RiverRendering,
    columns: RiverColumnLayout,
    pane: RiverPaneState,
    topInset: Dp,
    bottomInset: Dp,
    actions: RiverBubbleActions,
) {
    val total = columns.totalWidth.dp
    val bubbleWidth = columns.bubbleContentWidth.dp
    androidx.compose.foundation.lazy.LazyColumn(
        state = pane.listState,
        modifier = Modifier.width(total).fillMaxHeight(),
    ) {
        item(key = TOP_KEY) { Spacer(Modifier.height(topInset + RiverMetrics.LaneHeader.HEIGHT.dp)) }
        items(count = rendering.geometry.rankCount, key = { it }) { rank ->
            val content = rendering.contentAt(rank)
            when {
                content == null -> Spacer(Modifier.height(1.dp))
                content.bubble.isSystem -> RiverBubble(content, total, actions)
                else -> Box(Modifier.width(total).padding(start = (columns.laneLeadingX(content.bubble.laneIndex) + RiverMetrics.Lane.GUTTER).dp)) {
                    RiverBubble(content, bubbleWidth, actions)
                }
            }
        }
        item(key = BOTTOM_KEY) { Spacer(Modifier.height(bottomInset)) }
    }
}

private const val TOP_KEY = "river-top"
private const val BOTTOM_KEY = "river-bottom"

/**
 * La hauteur de lecture, en RANG — ce que la loi des en-têtes attend. Elle est MESURÉE sur la pile (le
 * rang dont le milieu croise la ligne de lecture), et `derivedStateOf` ne l'émet qu'au changement de
 * rang : la lire ne recompose rien à chaque image.
 */
@Composable
private fun rememberFocusRank(pane: RiverPaneState, rendering: RiverRendering, metrics: RiverPaneMetrics): State<Int> =
    remember(pane, rendering, metrics.heightPx, metrics.headerInsetPx) {
        derivedStateOf {
            val line = RiverFraming.readingLine(metrics.heightPx, metrics.headerInsetPx)
            val rows = pane.listState.layoutInfo.visibleItemsInfo.mapNotNull { item ->
                val rank = RiverFraming.rankOfKey(item.key) ?: return@mapNotNull null
                val bubble = rendering.bubbleByRank[rank]?.takeIf { !it.isSystem } ?: return@mapNotNull null
                val joins = rendering.contentByMessageId[bubble.messageId]?.groupPosition?.joinsAbove == true
                val seam = if (joins) 0f else metrics.rowGapPx
                RiverRowExtent(rank, item.offset + seam, item.size - seam)
            }
            RiverFraming.focusRank(rows, line, pane.navigation.cursor.rank)
        }
    }

@Composable
private fun HeadersLayer(
    focusRank: State<Int>,
    rendering: RiverRendering,
    laneWidthDp: Float,
    pane: RiverPaneState,
    modifier: Modifier,
) {
    val rank = focusRank.value
    val headers = remember(rendering.geometry, rank) {
        RiverLaneHeaders.resolveRiverLaneHeaders(ResolveRiverLaneHeadersInput(rendering.geometry, rank.toDouble()))
    }
    RiverLaneHeaderStrip(headers, laneWidthDp, rendering.geometry.laneCount, pane.horizontal, modifier)
}

@Composable
private fun HandleLayer(
    scale: RiverTimeScale,
    focusRank: State<Int>,
    pane: RiverPaneState,
    rendering: RiverRendering,
    reduceMotion: Boolean,
    modifier: Modifier,
) {
    val labels = remember(scale) { RiverTimeLabels(scale) }
    // La poignée ne se montre qu'au défilement, et s'efface au repos.
    var visible by remember { mutableStateOf(false) }
    LaunchedEffect(pane) {
        snapshotFlow {
            pane.listState.firstVisibleItemIndex * 1_000_003L + pane.listState.firstVisibleItemScrollOffset + pane.horizontal.value * 31L
        }
            .drop(1)
            .collectLatest {
                visible = true
                delay((RiverMetrics.TimeHandle.REST_DELAY_SECONDS * 1000).toLong())
                visible = false
            }
    }
    RiverTimeHandle(
        scale = scale,
        labels = labels,
        fraction = scale.fraction(focusRank.value),
        isVisible = visible,
        onSeek = { fraction ->
            val bubble = rendering.bubbleByRank[scale.rank(fraction)] ?: return@RiverTimeHandle
            pane.landOn(RiverCursor(bubble.laneIndex, bubble.rank), animated = !reduceMotion)
        },
        modifier = modifier,
    )
}

/** Le cadre de la bulle pressée, dans la FENÊTRE, remis au menu d'appui long (lu au geste, jamais mesuré par image). */
private fun publishFrame(
    messageId: String,
    rendering: RiverRendering,
    pane: RiverPaneState,
    windowOrigin: FloatArray,
    host: ChatHostContext,
    density: androidx.compose.ui.unit.Density,
) {
    val bubble = rendering.contentByMessageId[messageId]?.bubble ?: return
    val item = pane.listState.layoutInfo.visibleItemsInfo.firstOrNull { it.key == bubble.rank } ?: return
    val content = rendering.contentByMessageId[messageId] ?: return
    val frame = RiverFraming.bubbleFrame(
        row = RiverRowExtent(bubble.rank, item.offset.toFloat(), item.size.toFloat()),
        laneIndex = bubble.laneIndex,
        laneWidthPx = with(density) { pane.laneWidthDp.dp.toPx() },
        gutterPx = with(density) { RiverMetrics.Lane.GUTTER.dp.toPx() },
        seamPx = if (content.groupPosition.joinsAbove) 0f else with(density) { RiverMetrics.Row.GAP.dp.toPx() },
        horizontalScrollPx = pane.horizontal.value.toFloat(),
    )
    host.bubbleFrames[messageId] = frame.translate(Offset(windowOrigin[0], windowOrigin[1]))
}

private fun FloatArray.assign(origin: Offset) {
    this[0] = origin.x
    this[1] = origin.y
}
