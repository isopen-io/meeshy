package me.meeshy.app.conversations

import android.content.Context
import android.view.accessibility.AccessibilityManager
import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.Spring
import androidx.compose.animation.core.animate
import androidx.compose.animation.core.spring
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.Orientation
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.gestures.draggable
import androidx.compose.foundation.gestures.rememberDraggableState
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawingPadding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.HorizontalDivider
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.MutableFloatState
import androidx.compose.runtime.derivedStateOf
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.clipToBounds
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.input.nestedscroll.NestedScrollConnection
import androidx.compose.ui.input.nestedscroll.NestedScrollSource
import androidx.compose.ui.input.nestedscroll.nestedScroll
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.Layout
import androidx.compose.ui.layout.onSizeChanged
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.CustomAccessibilityAction
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.customActions
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.stateDescription
import androidx.compose.ui.unit.Constraints
import androidx.compose.ui.unit.Velocity
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import kotlinx.coroutines.Job
import kotlinx.coroutines.launch
import me.meeshy.feature.conversations.R
import me.meeshy.sdk.model.conversationlist.ConversationPeekGeometry
import me.meeshy.sdk.model.conversationlist.ConversationPeekSizing
import me.meeshy.sdk.model.conversationlist.PeekMenuDetent
import me.meeshy.ui.accessibility.LocalReduceMotion
import me.meeshy.ui.theme.MeeshyTheme
import kotlin.math.roundToInt

internal const val PEEK_CARD_TEST_TAG = "conversation-peek-card"
internal const val PEEK_MENU_TEST_TAG = "conversation-peek-menu"
internal const val PEEK_HANDLE_TEST_TAG = "conversation-peek-handle"

private val CardMargin = 14.dp
private val CardMenuGap = 8.dp
private val MinCardBody = 96.dp
private val PanelShape = RoundedCornerShape(22.dp)

/**
 * **L'appui long sur une rangée** (#17244) : une grande carte d'aperçu, presque pleine largeur, au-dessus
 * d'un menu COMPACT (poignée + rangée de tête). Tirer le menu vers le haut l'agrandit jusqu'à montrer toutes
 * ses actions et réduit la carte d'autant ; [ConversationPeekGeometry] décide des deux hauteurs depuis UNE
 * progression 0 → 1 que le doigt déplace image par image.
 *
 * Fluidité : la carte, son corps et le menu sont mesurés à taille constante ; pendant le geste, seuls le fond
 * de la carte (une boîte vide) et les PLACEMENTS changent. La carte ne montre que le CONTENU, sans en-tête
 * (consigne porteur : on sait déjà ce qu'on a pressé) ; TalkBack l'entend nommée par [cardLabel]. Le corps
 * est ancré en bas (les derniers messages restent visibles) et ce qui déborde par le haut est coupé par la
 * zone de l'aperçu. Aucun rechargement de l'aperçu pendant le tirage.
 *
 * Accessibilité : lecteur d'écran ou animations réduites ⇒ ouvert étendu ; la poignée (44 dp) bascule les
 * crans au toucher et expose « Afficher toutes les actions » comme action d'accessibilité.
 */
@Composable
internal fun ConversationLongPressPeek(
    onDismiss: () -> Unit,
    cardLabel: String,
    cardBody: @Composable () -> Unit,
    quickActions: @Composable () -> Unit,
    allActions: @Composable () -> Unit,
) {
    val reduceMotion = LocalReduceMotion.current
    val screenReader = rememberPeekScreenReaderRunning()
    val progress = remember {
        mutableFloatStateOf(ConversationPeekSizing.initialDetent(screenReader, reduceMotion).progress)
    }
    val geometry = remember { PeekGeometryHolder() }
    val motion = rememberPeekMotion(progress, geometry, reduceMotion)
    val appear = remember { Animatable(if (reduceMotion) 1f else 0f) }
    LaunchedEffect(Unit) { if (!reduceMotion) appear.animateTo(1f, tween(durationMillis = 180)) }

    Dialog(
        onDismissRequest = onDismiss,
        properties = DialogProperties(usePlatformDefaultWidth = false, decorFitsSystemWindows = false),
    ) {
        Box(
            Modifier
                .fillMaxSize()
                .clickable(interactionSource = remember { MutableInteractionSource() }, indication = null, onClick = onDismiss)
                .safeDrawingPadding()
                .padding(vertical = 12.dp)
                .graphicsLayer {
                    alpha = appear.value
                    val scale = 0.96f + 0.04f * appear.value
                    scaleX = scale
                    scaleY = scale
                },
        ) {
            PeekLayout(
                progress = progress,
                geometry = geometry,
                cardLabel = cardLabel,
                cardBody = cardBody,
                menu = { onCompactMeasured ->
                    PeekMenuPanel(
                        progress = progress,
                        motion = motion,
                        onCompactMeasured = onCompactMeasured,
                        quickActions = quickActions,
                        allActions = allActions,
                    )
                },
            )
        }
    }
}

/** La géométrie de la dernière mesure, lue par les gestes (jamais un état : l'écrire ne recompose rien). */
private class PeekGeometryHolder {
    var value: ConversationPeekGeometry? = null
}

/** Ce que le geste fait de la progression : suivre le doigt, puis conclure vers un cran. */
private class PeekMotion(
    val drag: (upwardDelta: Float) -> Unit,
    val settle: (upwardVelocity: Float) -> Unit,
    val toggle: () -> Unit,
    val stop: () -> Unit,
    val travel: () -> Float,
)

@Composable
private fun rememberPeekMotion(
    progress: MutableFloatState,
    geometry: PeekGeometryHolder,
    reduceMotion: Boolean,
): PeekMotion {
    val scope = rememberCoroutineScope()
    var settling by remember { mutableStateOf<Job?>(null) }
    return remember(reduceMotion) {
        fun goTo(detent: PeekMenuDetent, upwardVelocity: Float) {
            settling?.cancel()
            val travel = geometry.value?.travel ?: 0f
            if (reduceMotion || travel <= 0f) {
                progress.floatValue = detent.progress
                return
            }
            settling = scope.launch {
                animate(
                    initialValue = progress.floatValue,
                    targetValue = detent.progress,
                    initialVelocity = upwardVelocity / travel,
                    animationSpec = spring(dampingRatio = 0.9f, stiffness = Spring.StiffnessMediumLow),
                ) { value, _ -> progress.floatValue = value }
            }
        }
        PeekMotion(
            drag = { delta ->
                geometry.value?.let { progress.floatValue = it.progressAfterDrag(progress.floatValue, delta) }
            },
            settle = { velocity ->
                geometry.value?.let { g -> goTo(g.settle(progress.floatValue, velocity), velocity) }
            },
            toggle = {
                val target = if (progress.floatValue >= ConversationPeekSizing.SETTLE_THRESHOLD) {
                    PeekMenuDetent.Compact
                } else {
                    PeekMenuDetent.Expanded
                }
                goTo(target, 0f)
            },
            stop = { settling?.cancel() },
            travel = { geometry.value?.travel ?: 0f },
        )
    }
}

/**
 * Trois enfants : fond de carte, corps, menu. Tous mesurés à taille constante sauf le fond ;
 * la lecture de [progress] n'a lieu qu'ici, en phase de mise en page : le geste ne recompose rien.
 */
@Composable
private fun PeekLayout(
    progress: MutableFloatState,
    geometry: PeekGeometryHolder,
    cardLabel: String,
    cardBody: @Composable () -> Unit,
    menu: @Composable (onCompactMeasured: (Int) -> Unit) -> Unit,
) {
    val tokens = MeeshyTheme.tokens
    val compactHeight = remember { mutableIntStateOf(0) }
    Layout(
        modifier = Modifier.fillMaxSize().clipToBounds(),
        content = {
            Box(
                Modifier
                    .clip(PanelShape)
                    .background(tokens.backgroundPrimary)
                    .swallowTaps(),
            )
            Box(
                Modifier
                    .swallowTaps()
                    .semantics(mergeDescendants = false) { contentDescription = cardLabel }
                    .testTag(PEEK_CARD_TEST_TAG),
            ) { cardBody() }
            Box(Modifier.swallowTaps()) { menu { compactHeight.intValue = it } }
        },
    ) { measurables, constraints ->
        val width = constraints.maxWidth
        val available = constraints.maxHeight.toFloat()
        val margin = CardMargin.roundToPx()
        val gap = CardMenuGap.toPx()
        val panelWidth = (width - 2 * margin).coerceAtLeast(0)
        val minCard = MinCardBody.toPx()
        val menuCeiling = (available - gap - minCard).roundToInt().coerceAtLeast(0)
        val menu = measurables[2].measure(Constraints(minWidth = panelWidth, maxWidth = panelWidth, maxHeight = menuCeiling))
        val g = ConversationPeekGeometry(
            available = available,
            gap = gap,
            minCard = minCard,
            compactMenu = compactHeight.intValue.takeIf { it > 0 }?.toFloat() ?: menu.height.toFloat(),
            naturalMenu = menu.height.toFloat(),
        )
        geometry.value = g
        val bodyHeight = g.restingCard.roundToInt().coerceAtLeast(0)
        val body = measurables[1].measure(Constraints.fixed(panelWidth, bodyHeight))
        val heights = g.heightsAt(progress.floatValue)
        val cardHeight = heights.card.roundToInt()
        val background = measurables[0].measure(Constraints.fixed(panelWidth, cardHeight))
        layout(width, constraints.maxHeight) {
            background.place(margin, 0)
            body.place(margin, cardHeight - body.height)
            menu.place(margin, (heights.card + gap).roundToInt())
        }
    }
}

@Composable
private fun PeekMenuPanel(
    progress: MutableFloatState,
    motion: PeekMotion,
    onCompactMeasured: (Int) -> Unit,
    quickActions: @Composable () -> Unit,
    allActions: @Composable () -> Unit,
) {
    val tokens = MeeshyTheme.tokens
    val dragState = rememberDraggableState { delta -> motion.drag(-delta) }
    val connection = remember(motion) { PeekNestedScroll(progress, motion) }
    Column(
        Modifier
            .fillMaxWidth()
            .clip(PanelShape)
            .background(tokens.backgroundPrimary)
            .testTag(PEEK_MENU_TEST_TAG),
    ) {
        Column(
            Modifier
                .fillMaxWidth()
                .onSizeChanged { onCompactMeasured(it.height) }
                .draggable(
                    state = dragState,
                    orientation = Orientation.Vertical,
                    onDragStarted = { motion.stop() },
                    onDragStopped = { velocity -> motion.settle(-velocity) },
                ),
        ) {
            PeekHandle(progress, motion)
            quickActions()
        }
        HorizontalDivider()
        Column(
            Modifier
                .weight(1f, fill = false)
                .nestedScroll(connection)
                .verticalScroll(rememberScrollState()),
        ) { allActions() }
    }
}

/**
 * Le menu compact absorbe d'abord le défilement vers le haut (il s'agrandit), et la liste revenue en
 * haut rend le défilement vers le bas au menu (il se replie). Un lancer pendant la course conclut le cran.
 */
private class PeekNestedScroll(
    private val progress: MutableFloatState,
    private val motion: PeekMotion,
) : NestedScrollConnection {
    override fun onPreScroll(available: Offset, source: NestedScrollSource): Offset {
        if (source != NestedScrollSource.UserInput || available.y >= 0f || progress.floatValue >= 1f) return Offset.Zero
        motion.stop()
        motion.drag(-available.y)
        return Offset(0f, available.y)
    }

    override fun onPostScroll(consumed: Offset, available: Offset, source: NestedScrollSource): Offset {
        if (source != NestedScrollSource.UserInput || available.y <= 0f || progress.floatValue <= 0f) return Offset.Zero
        motion.stop()
        motion.drag(-available.y)
        return Offset(0f, available.y)
    }

    override suspend fun onPreFling(available: Velocity): Velocity {
        val value = progress.floatValue
        if (value <= 0f || value >= 1f || motion.travel() <= 0f) return Velocity.Zero
        motion.settle(-available.y)
        return available
    }
}

@Composable
private fun PeekHandle(progress: MutableFloatState, motion: PeekMotion) {
    val tokens = MeeshyTheme.tokens
    val expanded by remember(progress) {
        derivedStateOf { progress.floatValue >= ConversationPeekSizing.SETTLE_THRESHOLD }
    }
    val expandLabel = stringResource(R.string.peek_menu_handle_expand)
    val collapseLabel = stringResource(R.string.peek_menu_handle_collapse)
    val stateLabel = stringResource(if (expanded) R.string.peek_menu_state_expanded else R.string.peek_menu_state_compact)
    val label = if (expanded) collapseLabel else expandLabel
    Box(
        Modifier
            .fillMaxWidth()
            .height(44.dp)
            .clickable(onClickLabel = label) { motion.toggle() }
            .semantics {
                role = Role.Button
                contentDescription = label
                stateDescription = stateLabel
                customActions = listOf(CustomAccessibilityAction(label) { motion.toggle(); true })
            }
            .testTag(PEEK_HANDLE_TEST_TAG),
        contentAlignment = Alignment.Center,
    ) {
        Box(
            Modifier
                .size(width = 36.dp, height = 5.dp)
                .clip(RoundedCornerShape(50))
                .background(tokens.textMuted.copy(alpha = 0.5f)),
        )
    }
}

/** Un toucher sur la carte ou le menu ne ferme pas l'aperçu (seul le toucher hors carte/menu le ferme). */
private fun Modifier.swallowTaps(): Modifier = pointerInput(Unit) { detectTapGestures { } }

/** TalkBack (exploration au toucher) tourne-t-il ? Suivi en direct. */
@Composable
private fun rememberPeekScreenReaderRunning(): Boolean {
    val context = LocalContext.current
    val manager = remember(context) { context.getSystemService(Context.ACCESSIBILITY_SERVICE) as? AccessibilityManager }
    var running by remember(manager) { mutableStateOf(manager?.isEnabled == true && manager.isTouchExplorationEnabled) }
    DisposableEffect(manager) {
        val listener = AccessibilityManager.TouchExplorationStateChangeListener { enabled ->
            running = enabled && manager?.isEnabled == true
        }
        manager?.addTouchExplorationStateChangeListener(listener)
        onDispose { manager?.removeTouchExplorationStateChangeListener(listener) }
    }
    return running
}
