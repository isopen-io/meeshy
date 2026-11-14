package me.meeshy.ui.component.kit

import androidx.compose.animation.core.FiniteAnimationSpec
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.foundation.background
import androidx.compose.foundation.focusable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsFocusedAsState
import androidx.compose.foundation.interaction.collectIsHoveredAsState
import androidx.compose.foundation.interaction.collectIsPressedAsState
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.selection.selectableGroup
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.material3.minimumInteractiveComponentSize
import androidx.compose.runtime.Composable
import androidx.compose.runtime.Immutable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.key
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.focus.focusProperties
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Rect
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.geometry.lerp
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.input.key.Key as ComposeKey
import androidx.compose.ui.input.key.KeyEvent
import androidx.compose.ui.input.key.KeyEventType
import androidx.compose.ui.input.key.key
import androidx.compose.ui.input.key.onKeyEvent
import androidx.compose.ui.input.key.type
import androidx.compose.ui.layout.Layout
import androidx.compose.ui.layout.MeasureResult
import androidx.compose.ui.layout.MeasureScope
import androidx.compose.ui.layout.Measurable
import androidx.compose.ui.layout.Placeable
import androidx.compose.ui.platform.LocalLayoutDirection
import androidx.compose.ui.semantics.CollectionInfo
import androidx.compose.ui.semantics.CollectionItemInfo
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.collectionInfo
import androidx.compose.ui.semantics.collectionItemInfo
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.Constraints
import androidx.compose.ui.unit.LayoutDirection
import kotlin.math.floor
import kotlin.math.min
import kotlin.math.roundToInt
import me.meeshy.ui.accessibility.LocalReduceMotion
import me.meeshy.ui.haptics.MeeshyHaptics
import me.meeshy.ui.haptics.rememberMeeshyHaptics
import me.meeshy.ui.motion.meeshySpec
import me.meeshy.ui.theme.MeeshyAdaptiveColors
import me.meeshy.ui.theme.MeeshyControlSize
import me.meeshy.ui.theme.MeeshyFontSize
import me.meeshy.ui.theme.MeeshyMediaChromeColors
import me.meeshy.ui.theme.MeeshyMotion
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshyRadius
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme

/**
 * Une option du choix. [id] porte la valeur, [title] le texte affiché, [contentDescription] remplace le titre quand celui-ci
 * est une abréviation. Miroir de `MeeshySegmentedOption` (iOS).
 */
@Immutable
public data class MeeshySegmentedOption<T>(
    val id: T,
    val title: String,
    val contentDescription: String? = null,
)

/** `choice` : un réglage, lu comme un contrôle à choix. `tabs` : ce qui change le contenu voisin, lu comme des onglets. */
public enum class MeeshySegmentedRole { Choice, Tabs }

/** `media` : posé sur une image ou un panneau sombre. `theme` : les encres du thème, pour les hôtes hors média. */
public enum class MeeshySegmentedTone { Media, Theme }

/**
 * Les teintes d'un ton, toutes tirées des jetons : piste, pastille, encre au repos, encre du courant, fond d'appui. Les
 * contrastes se calculent dessus. Miroir de `MeeshySegmentedPalette` (iOS).
 */
@Immutable
public data class MeeshySegmentedPalette(
    val track: Color,
    val pill: Color,
    val restInk: Color,
    val currentInk: Color,
    val pressedFill: Color,
) {
    public companion object {
        public fun of(tone: MeeshySegmentedTone, isDark: Boolean): MeeshySegmentedPalette = when (tone) {
            MeeshySegmentedTone.Media -> MeeshySegmentedPalette(
                track = MeeshyAdaptiveColors.controlFill(isDark = true),
                pill = MeeshyMediaChromeColors.OnMedia,
                restInk = MeeshyMediaChromeColors.OnMedia,
                currentInk = MeeshyPalette.Indigo950,
                pressedFill = MeeshyMediaChromeColors.MediaFill,
            )
            MeeshySegmentedTone.Theme -> MeeshySegmentedPalette(
                track = MeeshyAdaptiveColors.controlFill(isDark),
                pill = MeeshyAdaptiveColors.textPrimary(isDark),
                restInk = MeeshyAdaptiveColors.textPrimary(isDark),
                currentInk = MeeshyAdaptiveColors.backgroundPrimary(isDark),
                pressedFill = MeeshyAdaptiveColors.controlFill(isDark),
            )
        }
    }
}

/**
 * **Un choix exclusif entre deux à quatre options** (K03), toutes visibles dans une même piste ; la courante porte la
 * pastille qui glisse vers le nouveau segment. Il ne porte ni verre ni ombre : il se pose dans un hôte opaque ou de verre
 * dense. Le libellé [label] nomme le groupe pour l'accessibilité et ne s'affiche jamais.
 *
 * - Toucher un segment non courant : [onSelect] part avec sa valeur, un haptique léger ; toucher le courant ne fait rien.
 * - Hors de deux à quatre options, rien n'est rendu, pas même la piste (loi 13).
 * - [pressed] fige l'appui sur un segment non courant (catalogue) ; [enabled] faux : ni rappel, ni haptique, toute la
 *   piste à l'opacité désactivée du kit, aucun segment grisé seul.
 * - Clavier : UN seul arrêt de focus, la piste, cerclée à l'encre du ton quand il la tient ; flèches vers le voisin qui
 *   se sélectionne (en boucle, sens de lecture pris en compte), Début et Fin.
 * - Réduire les animations : la pastille est posée, sans glissement.
 *
 * Pendant iOS : `MeeshySegmented`.
 */
@Composable
public fun <T> MeeshySegmented(
    label: String,
    selected: T,
    onSelect: (T) -> Unit,
    options: List<MeeshySegmentedOption<T>>,
    modifier: Modifier = Modifier,
    role: MeeshySegmentedRole = MeeshySegmentedRole.Choice,
    tone: MeeshySegmentedTone = MeeshySegmentedTone.Media,
    enabled: Boolean = true,
    pressed: T? = null,
    haptics: MeeshyHaptics = rememberMeeshyHaptics(),
) {
    if (!MeeshySegmentedLaw.isRenderable(options.size)) return
    val ids = remember(options) { options.map { it.id } }
    val current = MeeshySegmentedLaw.currentIndex(selected, ids)
    val palette = MeeshySegmentedPalette.of(tone, MeeshyTheme.isDark)
    val isRtl = LocalLayoutDirection.current == LayoutDirection.Rtl
    val pillIndex by animateFloatAsState(
        targetValue = (current ?: 0).toFloat(),
        animationSpec = meeshySegmentedPillMotion(reduceMotion = LocalReduceMotion.current),
        label = "meeshySegmentedPill",
    )
    val geometry = remember { SegmentGeometry() }
    val sources = remember(options.size) { List(options.size) { MutableInteractionSource() } }
    val trackSource = remember { MutableInteractionSource() }
    val trackFocused by trackSource.collectIsFocusedAsState()
    val segmentRole = if (role == MeeshySegmentedRole.Tabs) Role.Tab else Role.RadioButton
    val latest = rememberUpdatedState(SegmentedChoice(current, enabled, options, onSelect, haptics))
    val choose: (Int) -> Unit = remember(latest) { { target: Int -> latest.value.choose(target) } }

    Box(
        modifier = modifier.minimumInteractiveComponentSize(),
        contentAlignment = Alignment.Center,
    ) {
        Layout(
            content = {
                options.forEachIndexed { index, option ->
                    key(option.id) {
                        Segment(
                            option = option,
                            index = index,
                            isCurrent = current == index,
                            isForcedPressed = pressed == option.id && current != index,
                            palette = palette,
                            enabled = enabled,
                            role = segmentRole,
                            source = sources[index],
                            onChoose = choose,
                        )
                    }
                }
            },
            modifier = Modifier
                .drawBehind {
                    if (!trackFocused) return@drawBehind
                    val stroke = MeeshySpacing.xxs.toPx()
                    val outset = MeeshySpacing.xxs.toPx() + stroke / 2f
                    drawRoundRect(
                        color = palette.restInk,
                        topLeft = Offset(-outset, -outset),
                        size = Size(size.width + 2f * outset, size.height + 2f * outset),
                        cornerRadius = CornerRadius(MeeshyRadius.xl.toPx() + outset),
                        style = Stroke(width = stroke),
                    )
                }
                .alpha(if (enabled) 1f else MeeshyGlassButtonRecipe.DISABLED_OPACITY)
                .background(palette.track, RoundedCornerShape(MeeshyRadius.xl))
                .drawBehind {
                    if (current == null) return@drawBehind
                    val rects = geometry.rects
                    if (rects.isEmpty()) return@drawBehind
                    val position = pillIndex.coerceIn(0f, rects.lastIndex.toFloat())
                    val lower = floor(position).toInt()
                    val upper = min(lower + 1, rects.lastIndex)
                    val slot = lerp(rects[lower], rects[upper], position - lower)
                    val left = if (isRtl) size.width - slot.right else slot.left
                    drawRoundRect(
                        color = palette.pill,
                        topLeft = Offset(left, slot.top),
                        size = Size(slot.width, slot.height),
                        cornerRadius = CornerRadius(slot.height / 2f),
                    )
                }
                .selectableGroup()
                .semantics {
                    contentDescription = label
                    collectionInfo = CollectionInfo(rowCount = 1, columnCount = options.size)
                }
                .onKeyEvent { event ->
                    if (event.type != KeyEventType.KeyDown) return@onKeyEvent false
                    val law = event.lawKey() ?: return@onKeyEvent false
                    val target = MeeshySegmentedLaw.keyboardTarget(law, current ?: 0, options.size, isRtl)
                        ?: return@onKeyEvent false
                    choose(target)
                    true
                }
                .focusable(enabled = enabled, interactionSource = trackSource),
        ) { measurables, constraints ->
            placeSegments(measurables, constraints, geometry)
        }
    }
}

/**
 * Le mouvement de la pastille : le ressort rapide du kit, ou posée d'un coup quand l'utilisateur réduit les animations.
 */
internal fun meeshySegmentedPillMotion(reduceMotion: Boolean): FiniteAnimationSpec<Float> =
    meeshySpec(reduce = reduceMotion, full = MeeshyMotion.springFast())

/**
 * Ce qu'un toucher ou une touche lit au moment où il arrive : tenu par `rememberUpdatedState`, il laisse le rappel des
 * segments STABLE, donc un changement de sélection ne recompose que les deux segments dont l'encre bascule.
 */
private class SegmentedChoice<T>(
    private val current: Int?,
    private val enabled: Boolean,
    private val options: List<MeeshySegmentedOption<T>>,
    private val onSelect: (T) -> Unit,
    private val haptics: MeeshyHaptics,
) {
    fun choose(target: Int) {
        if (target !in options.indices) return
        MeeshySegmentedLaw.tapResult(current, target, isEnabled = enabled)?.let { next ->
            haptics.light()
            onSelect(options[next].id)
        }
    }
}

/** Les rectangles des segments, en px de la piste, tels que la dernière mise en page les a posés. Lus en phase de dessin. */
private class SegmentGeometry {
    var rects: List<Rect> = emptyList()
}

@Composable
private fun <T> Segment(
    option: MeeshySegmentedOption<T>,
    index: Int,
    isCurrent: Boolean,
    isForcedPressed: Boolean,
    palette: MeeshySegmentedPalette,
    enabled: Boolean,
    role: Role,
    source: MutableInteractionSource,
    onChoose: (Int) -> Unit,
) {
    val pressedNow by source.collectIsPressedAsState()
    val hovered by source.collectIsHoveredAsState()
    val surface = if (isForcedPressed || pressedNow || hovered) palette.pressedFill else Color.Transparent
    val spokenName = option.contentDescription ?: option.title
    Box(
        modifier = Modifier
            .heightIn(min = MeeshyControlSize.regular)
            .focusProperties { canFocus = false }
            .selectable(
                selected = isCurrent,
                enabled = enabled,
                role = role,
                interactionSource = source,
                indication = null,
                onClick = { onChoose(index) },
            )
            .semantics(mergeDescendants = true) {
                contentDescription = spokenName
                collectionItemInfo = CollectionItemInfo(rowIndex = 0, rowSpan = 1, columnIndex = index, columnSpan = 1)
            }
            .background(surface, RoundedCornerShape(MeeshyRadius.pill))
            .padding(horizontal = MeeshySpacing.smPlus),
        contentAlignment = Alignment.Center,
    ) {
        Text(
            text = option.title,
            style = TextStyle(fontSize = MeeshyFontSize.subhead, fontWeight = FontWeight.Bold, textAlign = TextAlign.Center),
            color = if (isCurrent) palette.currentInk else palette.restInk,
        )
    }
}

/**
 * La répartition de la planche (parts égales, plancher au texte, repli en rangées), comme le `Layout` iOS : chaque
 * segment d'une rangée en prend toute la hauteur, les rangées se touchent, et une option seule plus large que la piste y
 * est bornée (son texte passe à la ligne plutôt que de déborder). Les places s'écrivent de gauche à droite :
 * `placeRelative` les retourne en RTL.
 */
private fun MeasureScope.placeSegments(
    measurables: List<Measurable>,
    constraints: Constraints,
    geometry: SegmentGeometry,
): MeasureResult {
    val inset = MeeshySpacing.xs.roundToPx()
    val minHeight = MeeshyControlSize.regular.roundToPx()
    val ideal = measurables.map { it.maxIntrinsicWidth(Constraints.Infinity).toDouble() }
    val available = if (constraints.hasBoundedWidth) {
        (constraints.maxWidth - 2 * inset).coerceAtLeast(0).toDouble()
    } else {
        ideal.sum()
    }
    val rows = MeeshySegmentedLaw.rows(ideal, available)
    val shares = MeeshySegmentedLaw.partition(ideal, available)
    val placed = rows.zip(shares).fold(PlacedRows(bottom = inset)) { acc, (row, widths) ->
        val sized = row.zip(widths) { index, width -> index to min(width, available).roundToInt() }
        val height = sized.maxOf { (index, width) -> measurables[index].maxIntrinsicHeight(width) }.coerceAtLeast(minHeight)
        val measured = sized.map { (index, width) -> index to measurables[index].measure(Constraints.fixed(width, height)) }
        acc.append(measured, height, inset)
    }
    val width = if (constraints.hasBoundedWidth) constraints.maxWidth else (available + 2 * inset).roundToInt()
    val height = placed.bottom + inset
    geometry.rects = placed.cells.sortedBy { it.index }.map { it.rect }
    return layout(width, height) {
        placed.cells.forEach { cell -> cell.placeable.placeRelative(cell.x, cell.y) }
    }
}

/** Une cellule posée : son index d'option, sa mesure, et sa place (coordonnées de la piste, sens LTR). */
private class PlacedCell(val index: Int, val placeable: Placeable, val x: Int, val y: Int) {
    val rect: Rect
        get() = Rect(
            left = x.toFloat(),
            top = y.toFloat(),
            right = (x + placeable.width).toFloat(),
            bottom = (y + placeable.height).toFloat(),
        )
}

/** Les rangées posées, accumulées sans mutation : chaque rangée rend la suivante, collée à elle. Les index restent dans l'ordre. */
private data class PlacedRows(
    val cells: List<PlacedCell> = emptyList(),
    val bottom: Int = 0,
) {
    fun append(row: List<Pair<Int, Placeable>>, height: Int, inset: Int): PlacedRows {
        val offsets = row.runningFold(0) { x, (_, placeable) -> x + placeable.width }
        val laid = row.zip(offsets) { (index, placeable), x -> PlacedCell(index, placeable, inset + x, bottom) }
        return PlacedRows(cells = cells + laid, bottom = bottom + height)
    }
}

private fun KeyEvent.lawKey(): MeeshySegmentedLaw.Key? = when (key) {
    ComposeKey.DirectionLeft -> MeeshySegmentedLaw.Key.Left
    ComposeKey.DirectionRight -> MeeshySegmentedLaw.Key.Right
    ComposeKey.MoveHome -> MeeshySegmentedLaw.Key.Home
    ComposeKey.MoveEnd -> MeeshySegmentedLaw.Key.End
    ComposeKey.Spacebar -> MeeshySegmentedLaw.Key.Space
    else -> null
}
