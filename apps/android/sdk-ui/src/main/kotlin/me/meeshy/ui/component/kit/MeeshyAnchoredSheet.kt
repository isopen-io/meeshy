package me.meeshy.ui.component.kit

import androidx.activity.compose.BackHandler
import androidx.compose.animation.core.animate
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.snap
import androidx.compose.animation.core.spring
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.DraggableState
import androidx.compose.foundation.gestures.Orientation
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.gestures.draggable
import androidx.compose.foundation.gestures.rememberDraggableState
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.BoxWithConstraintsScope
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.navigationBars
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.layout.windowInsetsBottomHeight
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.LocalContentColor
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.SideEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.drawscope.DrawScope
import androidx.compose.ui.input.key.Key
import androidx.compose.ui.input.key.KeyEventType
import androidx.compose.ui.input.key.key
import androidx.compose.ui.input.key.onKeyEvent
import androidx.compose.ui.input.key.type
import androidx.compose.ui.input.nestedscroll.nestedScroll
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.onSizeChanged
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.CustomAccessibilityAction
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.customActions
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.isTraversalGroup
import androidx.compose.ui.semantics.paneTitle
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.stateDescription
import androidx.compose.ui.semantics.traversalIndex
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.unit.dp
import kotlin.math.roundToInt
import kotlinx.coroutines.Job
import kotlinx.coroutines.launch
import me.meeshy.ui.R
import me.meeshy.ui.accessibility.LocalReduceMotion
import me.meeshy.ui.icons.MeeshyIcons
import me.meeshy.ui.theme.MeeshyControlSize
import me.meeshy.ui.theme.MeeshyFontSize
import me.meeshy.ui.theme.MeeshyMediaChromeColors
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshyRadius
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme

/**
 * **Une feuille opaque ancrée en bas de son hôte** (K15) : poignée, titre et fermeture optionnels, hauteur au contenu,
 * fixe ou à crans. Elle PUBLIE sa place au repos ([MeeshyAnchoredSheetState.footprintPx]) pour que l'hôte réduise son
 * contenu au-dessus d'elle au lieu de le laisser passer dessous. Elle remplit son hôte (c'est lui qui borne la place
 * disponible) et ne dessine, hors de la feuille, qu'une zone qui la ferme au toucher — sans voile, sauf [scrim].
 *
 * Elle ne choisit rien : quelle feuille s'ouvre, son titre traduit, sa hauteur par portail, la réduction du contenu et les
 * états de ce qu'elle porte sont à l'hôte. [onDismissRequest] est le chemin UNIQUE de ✕, du glissé, du toucher hors
 * feuille, d'Échap, du retour matériel, du reste d'un défilement et du geste d'échappement du lecteur d'écran.
 *
 * - Glissé vers le bas depuis la poignée ou l'en-tête : la feuille suit le doigt, sans monter au-dessus de son repos
 *   (hors crans) ; elle se ferme au quart de sa hauteur ou si sa fin prédite passe la moitié ([MeeshyAnchoredSheetMetrics]).
 * - En-tête : titre au bord de début, ✕ doux (K02) au bord de fin, remplacé par [trailing]. Sans titre ni [trailing],
 *   pas de rangée ; sans [closeLabel], pas de ✕.
 * - [surface] : [MeeshyAnchoredSheetSurface.Theme] suit le thème, [MeeshyAnchoredSheetSurface.Dark] force l'indigo sombre.
 * - [outside] : [MeeshyAnchoredSheetOutside.Dismisses] ferme au toucher hors feuille et rend la feuille modale,
 *   [MeeshyAnchoredSheetOutside.PassesThrough] laisse le toucher à l'hôte.
 *
 * Performance : le décalage du doigt n'est lu qu'en phase de mise en page (`offset { }`) : ni le contenu de l'hôte ni
 * celui de la feuille ne se recomposent à chaque image. Seuls la translation et l'opacité s'animent.
 *
 * Pendant iOS : `MeeshyAnchoredSheet`.
 */
@Composable
public fun MeeshyAnchoredSheet(
    onDismissRequest: () -> Unit,
    modifier: Modifier = Modifier,
    title: String? = null,
    accessibilityLabel: String? = null,
    height: MeeshyAnchoredSheetHeight = MeeshyAnchoredSheetHeight.Content,
    maximumFraction: Float = MeeshyAnchoredSheetMetrics.MAXIMUM_FRACTION,
    showsHandle: Boolean = true,
    isDragDismissEnabled: Boolean = true,
    closeLabel: String? = stringResource(R.string.kit_anchored_sheet_close),
    surface: MeeshyAnchoredSheetSurface = MeeshyAnchoredSheetSurface.Theme,
    outside: MeeshyAnchoredSheetOutside = MeeshyAnchoredSheetOutside.Dismisses,
    scrim: Boolean = false,
    maxWidth: Dp? = null,
    state: MeeshyAnchoredSheetState = rememberMeeshyAnchoredSheetState(),
    trailing: (@Composable () -> Unit)? = null,
    content: @Composable () -> Unit,
) {
    assert(title != null || !accessibilityLabel.isNullOrEmpty()) {
        "MeeshyAnchoredSheet : sans titre, accessibilityLabel est obligatoire"
    }
    val density = LocalDensity.current.density
    val reduceMotion = LocalReduceMotion.current
    val motion = remember(reduceMotion) { MeeshyAnchoredSheetMetrics.motion(reduceMotion) }
    val currentDismiss = rememberUpdatedState(onDismissRequest)
    val owner = remember { Any() }

    SideEffect {
        state.densityPx = density
        state.isPullEnabled = isDragDismissEnabled
        state.onPullDismiss = { currentDismiss.value() }
    }
    remember(height) {
        if (height is MeeshyAnchoredSheetHeight.Detents) {
            state.detentIndex = MeeshyAnchoredSheetMetrics.initialDetentIndex(height.parts, height.initial)
        }
        Unit
    }
    DisposableEffect(state, owner) { onDispose { state.release(owner) } }

    BoxWithConstraints(modifier.fillMaxSize().semantics { isTraversalGroup = true }) {
        val availableDp = maxHeight.value
        var contentDp by remember { mutableStateOf<Float?>(null) }
        val layout = remember(height, contentDp, availableDp, maximumFraction, state.detentIndex) {
            MeeshyAnchoredSheetLayout.resolve(height, contentDp, availableDp, maximumFraction, state.detentIndex)
        }
        val chrome = remember(title, trailing != null, closeLabel, showsHandle, isDragDismissEnabled, layout.hasDetents, outside, scrim) {
            MeeshyAnchoredSheetChrome.resolve(
                hasTitle = title != null,
                hasTrailing = trailing != null,
                hasCloseLabel = closeLabel != null,
                showsHandle = showsHandle,
                isDragDismissEnabled = isDragDismissEnabled,
                hasDetents = layout.hasDetents,
                outside = outside,
                scrim = scrim,
            )
        }

        val isPublishable = height != MeeshyAnchoredSheetHeight.Content || contentDp != null
        val restPx = layout.rest * density
        LaunchedEffect(restPx, isPublishable) { if (isPublishable) state.publish(owner, restPx) }

        if (chrome.isModal) {
            BackHandler(onBack = { currentDismiss.value() })
            OutsideLayer(showsScrim = chrome.showsScrim, onDismiss = { currentDismiss.value() })
        }
        Sheet(
            layout = layout,
            chrome = chrome,
            state = state,
            title = title,
            accessibilityLabel = accessibilityLabel,
            height = height,
            ceilingDp = MeeshyAnchoredSheetMetrics.ceiling(availableDp, maximumFraction),
            closeLabel = closeLabel,
            surface = surface,
            maxWidth = maxWidth,
            isDragDismissEnabled = isDragDismissEnabled,
            motion = motion,
            density = density,
            onDismiss = { currentDismiss.value() },
            onContentHeight = { contentDp = it },
            trailing = trailing,
            content = content,
        )
    }
}

/** Hors de la feuille : un bouton nommé qui la ferme, voilé si l'hôte le demande. Lu après la feuille par TalkBack. */
@Composable
private fun OutsideLayer(showsScrim: Boolean, onDismiss: () -> Unit) {
    val label = stringResource(R.string.kit_anchored_sheet_dismiss)
    Box(
        Modifier
            .fillMaxSize()
            .then(if (showsScrim) Modifier.background(MeeshyMediaChromeColors.MediaBackdrop.copy(alpha = MeeshyAnchoredSheetMetrics.SCRIM_OPACITY)) else Modifier)
            .clickable(
                interactionSource = remember { MutableInteractionSource() },
                indication = null,
                onClickLabel = label,
                role = Role.Button,
                onClick = onDismiss,
            )
            .semantics {
                contentDescription = label
                traversalIndex = OUTSIDE_TRAVERSAL_INDEX
            },
    )
}

@Composable
private fun BoxWithConstraintsScope.Sheet(
    layout: MeeshyAnchoredSheetLayout,
    chrome: MeeshyAnchoredSheetChrome,
    state: MeeshyAnchoredSheetState,
    title: String?,
    accessibilityLabel: String?,
    height: MeeshyAnchoredSheetHeight,
    ceilingDp: Float,
    closeLabel: String?,
    surface: MeeshyAnchoredSheetSurface,
    maxWidth: Dp?,
    isDragDismissEnabled: Boolean,
    motion: MeeshyAnchoredSheetMotion,
    density: Float,
    onDismiss: () -> Unit,
    onContentHeight: (Float) -> Unit,
    trailing: (@Composable () -> Unit)?,
    content: @Composable () -> Unit,
) {
    val isDark = surface == MeeshyAnchoredSheetSurface.Dark
    val surfaceColor = if (isDark) MeeshyPalette.Indigo950 else MeeshyTheme.tokens.backgroundPrimary
    val ink = if (isDark) MeeshyMediaChromeColors.OnMedia else MeeshyTheme.tokens.textPrimary
    val shadow = MeeshyMediaChromeColors.MediaBackdrop.copy(alpha = MeeshyAnchoredSheetMetrics.SHADOW_OPACITY)

    val scope = rememberCoroutineScope()
    var dragPx by remember { mutableFloatStateOf(0f) }
    var settling by remember { mutableStateOf<Job?>(null) }
    val restOffsetPx = animateFloatAsState(
        targetValue = layout.restOffset * density,
        animationSpec = if (motion.isImmediate) snap() else spring(dampingRatio = motion.dampingFraction, stiffness = motion.stiffness),
        label = "meeshyAnchoredSheetRest",
    )
    val latestLayout = rememberUpdatedState(layout)
    val upwardRoomPx = rememberUpdatedState(layout.restOffset * density)

    val dragState = rememberDraggableState { delta ->
        dragPx = MeeshyAnchoredSheetMetrics.dragOffset(dragPx + delta, upwardRoom = upwardRoomPx.value)
    }
    val release: (Float) -> Unit = { velocityPx ->
        val current = latestLayout.value
        val translation = dragPx / density
        val predicted = MeeshyAnchoredSheetMetrics.predictedEnd(translation, velocityPx / density)
        val settlement = MeeshyAnchoredSheetMetrics.settle(translation, predicted, current.index, current.rests)
        if (settlement is MeeshyAnchoredSheetSettlement.Rest) state.detentIndex = settlement.index
        settling = scope.launch {
            if (settlement is MeeshyAnchoredSheetSettlement.Dismiss) onDismiss()
            if (motion.isImmediate) {
                dragPx = 0f
            } else {
                animate(
                    initialValue = dragPx,
                    targetValue = 0f,
                    animationSpec = spring(dampingRatio = motion.dampingFraction, stiffness = motion.stiffness),
                ) { value, _ -> dragPx = value }
            }
        }
    }

    val sizeModifier = if (height == MeeshyAnchoredSheetHeight.Content) {
        Modifier.heightIn(max = ceilingDp.dp).onSizeChanged { onContentHeight(it.height / density) }
    } else {
        Modifier.height(layout.layoutHeight.dp)
    }
    val label = title ?: accessibilityLabel

    Column(
        modifier = Modifier
            .align(Alignment.BottomCenter)
            .offset { IntOffset(0, (restOffsetPx.value + dragPx).roundToInt()) }
            .then(if (maxWidth != null) Modifier.widthIn(max = maxWidth) else Modifier)
            .fillMaxWidth()
            .then(sizeModifier)
            .drawBehind { drawShadow(shadow, density) }
            .background(surfaceColor, SheetShape)
            .testTag(MeeshyAnchoredSheetTags.SHEET)
            .semantics {
                isTraversalGroup = true
                traversalIndex = 0f
                label?.let { paneTitle = it }
                if (title == null && accessibilityLabel != null) contentDescription = accessibilityLabel
            }
            .onKeyEvent { event ->
                val escapes = event.type == KeyEventType.KeyDown && event.key == Key.Escape
                if (escapes) onDismiss()
                escapes
            }
            .nestedScroll(state.nestedScrollConnection)
            .pointerInput(Unit) { detectTapGestures { } },
    ) {
        ForcedScheme(forcesDark = isDark) {
            CompositionLocalProvider(LocalContentColor provides ink) {
                Header(
                    chrome = chrome,
                    layout = layout,
                    title = title,
                    ink = ink,
                    surface = surface,
                    closeLabel = closeLabel,
                    isDragDismissEnabled = isDragDismissEnabled,
                    dragState = dragState,
                    onDragStart = { settling?.cancel() },
                    onDragStop = release,
                    onStep = { state.detentIndex = it },
                    onDismiss = onDismiss,
                    trailing = trailing,
                )
                val fillsHeight = height != MeeshyAnchoredSheetHeight.Content
                Box(
                    Modifier
                        .fillMaxWidth()
                        .weight(1f, fill = fillsHeight)
                        .padding(bottom = layout.restOffset.dp),
                ) { content() }
                Spacer(Modifier.height(MeeshySpacing.xxl))
                Spacer(Modifier.windowInsetsBottomHeight(WindowInsets.navigationBars))
            }
        }
    }
}

@Composable
private fun ForcedScheme(forcesDark: Boolean, content: @Composable () -> Unit) {
    if (forcesDark) MeeshyTheme(darkTheme = true, content = content) else content()
}

@Composable
private fun Header(
    chrome: MeeshyAnchoredSheetChrome,
    layout: MeeshyAnchoredSheetLayout,
    title: String?,
    ink: Color,
    surface: MeeshyAnchoredSheetSurface,
    closeLabel: String?,
    isDragDismissEnabled: Boolean,
    dragState: DraggableState,
    onDragStart: () -> Unit,
    onDragStop: (Float) -> Unit,
    onStep: (Int) -> Unit,
    onDismiss: () -> Unit,
    trailing: (@Composable () -> Unit)?,
) {
    if (!chrome.showsHandle && !chrome.showsHeader) return
    Column(
        Modifier
            .fillMaxWidth()
            .testTag(MeeshyAnchoredSheetTags.HEADER)
            .draggable(
                state = dragState,
                orientation = Orientation.Vertical,
                enabled = isDragDismissEnabled,
                onDragStarted = { onDragStart() },
                onDragStopped = { velocity -> onDragStop(velocity) },
            ),
    ) {
        if (chrome.showsHandle) {
            Handle(ink = ink, surface = surface, isAdjustable = chrome.handleIsAdjustable, layout = layout, onStep = onStep)
        }
        if (chrome.showsHeader) {
            HeaderRow(
                title = title,
                ink = ink,
                surface = surface,
                showsHandle = chrome.showsHandle,
                showsClose = chrome.showsClose,
                closeLabel = closeLabel,
                onDismiss = onDismiss,
                trailing = trailing,
            )
        }
    }
}

@Composable
private fun Handle(
    ink: Color,
    surface: MeeshyAnchoredSheetSurface,
    isAdjustable: Boolean,
    layout: MeeshyAnchoredSheetLayout,
    onStep: (Int) -> Unit,
) {
    val label = stringResource(R.string.kit_anchored_sheet_height)
    val value = stringResource(
        if (MeeshyAnchoredSheetMetrics.isExpanded(layout.index, layout.rests.size)) {
            R.string.kit_anchored_sheet_height_expanded
        } else {
            R.string.kit_anchored_sheet_height_reduced
        },
    )
    val increase = stringResource(R.string.a11y_kit_increase)
    val decrease = stringResource(R.string.a11y_kit_decrease)
    val last = layout.rests.size - 1
    val announced = if (isAdjustable) {
        Modifier.semantics(mergeDescendants = true) {
            contentDescription = label
            stateDescription = value
            customActions = listOf(
                CustomAccessibilityAction(increase) {
                    onStep(minOf(last, layout.index + 1))
                    true
                },
                CustomAccessibilityAction(decrease) {
                    onStep(maxOf(0, layout.index - 1))
                    true
                },
            )
        }
    } else {
        Modifier.clearAndSetSemantics {}
    }
    Box(
        Modifier
            .fillMaxWidth()
            .padding(top = MeeshySpacing.sm, bottom = MeeshySpacing.md)
            .testTag(MeeshyAnchoredSheetTags.HANDLE)
            .then(announced),
        contentAlignment = Alignment.Center,
    ) {
        Box(
            Modifier
                .size(MeeshyAnchoredSheetMetrics.HANDLE_WIDTH.dp, MeeshyAnchoredSheetMetrics.HANDLE_HEIGHT.dp)
                .background(ink.copy(alpha = MeeshyAnchoredSheetMetrics.handleOpacity(surface)), CircleShape),
        )
    }
}

@Composable
private fun HeaderRow(
    title: String?,
    ink: Color,
    surface: MeeshyAnchoredSheetSurface,
    showsHandle: Boolean,
    showsClose: Boolean,
    closeLabel: String?,
    onDismiss: () -> Unit,
    trailing: (@Composable () -> Unit)?,
) {
    Row(
        Modifier
            .fillMaxWidth()
            .heightIn(min = MeeshyControlSize.tapTarget)
            .padding(start = MeeshySpacing.lg, end = MeeshySpacing.lg, top = if (showsHandle) MeeshySpacing.none else MeeshySpacing.sm, bottom = MeeshySpacing.md),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.md),
    ) {
        if (title != null) {
            Text(
                text = title,
                color = ink,
                fontSize = MeeshyFontSize.headline,
                fontWeight = FontWeight.SemiBold,
                maxLines = 2,
                overflow = TextOverflow.Ellipsis,
                modifier = Modifier.weight(1f).semantics { heading() },
            )
        } else {
            Spacer(Modifier.weight(1f))
        }
        if (trailing != null) {
            trailing()
        } else if (showsClose && closeLabel != null) {
            MeeshyGlassButton(
                icon = MeeshyIcons.Close,
                label = closeLabel,
                onClick = onDismiss,
                kind = MeeshyGlassButtonKind.Soft,
                size = MeeshyGlassButtonSize.S36,
                tone = if (surface == MeeshyAnchoredSheetSurface.Dark) MeeshyGlassTone.Deep else MeeshyGlassTone.Theme,
            )
        }
    }
}

/**
 * Une ombre portée vers le haut, fixe : un dégradé sur l'étendue du flou, jamais de flou dessiné ni animé. Elle part des
 * coins arrondis de la feuille, pour ne pas déborder de leur courbe.
 */
private fun DrawScope.drawShadow(color: Color, density: Float) {
    val spread = MeeshyAnchoredSheetMetrics.SHADOW_RADIUS * 2f * density
    val inset = MeeshyRadius.xxl.toPx()
    drawRect(
        brush = Brush.verticalGradient(colors = listOf(Color.Transparent, color), startY = -spread, endY = 0f),
        topLeft = Offset(inset, -spread),
        size = Size((size.width - 2f * inset).coerceAtLeast(0f), spread),
    )
}

/** Les repères de test de la feuille : sa pile, sa zone de glissé (poignée et en-tête) et sa poignée. */
internal object MeeshyAnchoredSheetTags {
    const val SHEET: String = "meeshy-anchored-sheet"
    const val HEADER: String = "meeshy-anchored-sheet-header"
    const val HANDLE: String = "meeshy-anchored-sheet-handle"
}

private val SheetShape = RoundedCornerShape(topStart = MeeshyRadius.xxl, topEnd = MeeshyRadius.xxl)

private const val OUTSIDE_TRAVERSAL_INDEX = 1f
