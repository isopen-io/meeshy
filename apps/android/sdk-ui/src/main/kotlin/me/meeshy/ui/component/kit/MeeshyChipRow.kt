package me.meeshy.ui.component.kit

import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.AnimationSpec
import androidx.compose.animation.core.snap
import androidx.compose.animation.core.tween
import androidx.compose.foundation.ScrollState
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.selection.selectableGroup
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.key
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.snapshotFlow
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.onSizeChanged
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.LocalLayoutDirection
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.LayoutDirection
import androidx.compose.ui.unit.dp
import kotlin.math.roundToInt
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.flow.collectLatest
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch
import me.meeshy.ui.accessibility.LocalReduceMotion
import me.meeshy.ui.haptics.rememberMeeshyHaptics
import me.meeshy.ui.theme.MeeshySpacing

/**
 * **La rangée de puces de choix** (K04) : une rangée de capsules d'où l'on choisit une option ou plusieurs. Elle défile,
 * se replie ou partage sa largeur, et s'estompe au bord derrière lequel il reste des puces.
 *
 * Un composant CONTRÔLÉ : [selection] appartient à l'hôte, qui l'applique tout de suite ; [onChange] rend la sélection
 * calculée par [MeeshyChipRowRule] et la puce touchée, la rangée ne garde rien. Aucune matière (le verre, la feuille ou la
 * pilule qui la porte viennent d'ailleurs), aucune chaîne fabriquée : l'hôte passe noms et aides, déjà traduits.
 *
 * - Sans puce, la rangée ne rend rien, ni hauteur ni marge.
 * - [label] nomme le groupe pour le lecteur d'écran ; il est obligatoire. Une puce sans titre porte un `accessibilityLabel`.
 * - [enabled] faux désactive la rangée entière (contenu à 40 %, annoncée, non activable).
 * - [chipLabel] remplace le titre (un nom de police peint dans sa police) ; l'encre est celle que la recette donne à
 *   l'état de la puce.
 * - [inset] : la marge de début et de fin DANS le défilement, la rangée court jusqu'aux bords de la feuille.
 * - [pressedChip] fige une puce « pressée » : l'instantané et le catalogue ne tiennent pas un doigt sur l'écran.
 *
 * Optimisée : les puces ne se recomposent que si leur état change, l'appui se joue en phase de dessin, l'estompe ne lit le
 * défilement qu'en phase de dessin. Les fermetures de l'hôte ne sont pas comparées : il les garde stables.
 *
 * Android : la cible tactile de 48 dp tient DANS la rangée (la capsule y est centrée) : Compose ne prend aucun toucher hors
 * des bornes de la mise en page.
 *
 * Pendant iOS : `MeeshyChipRow`.
 */
@OptIn(ExperimentalLayoutApi::class)
@Composable
public fun <T> MeeshyChipRow(
    chips: List<MeeshyChip<T>>,
    selection: Set<T>,
    label: String,
    onChange: (next: Set<T>, tapped: T) -> Unit,
    modifier: Modifier = Modifier,
    mode: MeeshyChipRowMode = MeeshyChipRowMode.Single,
    layout: MeeshyChipRowLayout = MeeshyChipRowLayout.Scroll,
    semantics: MeeshyChipRowSemantics = MeeshyChipRowSemantics.Choice,
    surface: MeeshyChipRowSurface = MeeshyChipRowSurface.OnMedia,
    size: MeeshyChipRowSize = MeeshyChipRowSize.Regular,
    inset: Dp = 0.dp,
    revealsSelection: Boolean = true,
    haptic: MeeshyChipRowHaptic = MeeshyChipRowHaptic.Light,
    enabled: Boolean = true,
    onAction: ((tapped: T) -> Unit)? = null,
    pressedChip: T? = null,
    chipLabel: (@Composable (chip: MeeshyChip<T>, ink: Color) -> Unit)? = null,
) {
    if (chips.isEmpty()) return
    assert(label.isNotEmpty()) { "MeeshyChipRow : le nom du groupe est obligatoire et non vide" }
    assert(chips.all { it.hasAccessibleName }) { "MeeshyChipRow : une puce sans titre doit porter un accessibilityLabel" }

    val latestSelection = rememberUpdatedState(selection)
    val latestOnChange = rememberUpdatedState(onChange)
    val latestOnAction = rememberUpdatedState(onAction)
    val haptics = rememberMeeshyHaptics()
    val activate: (MeeshyChip<T>) -> Unit = remember(mode, haptic, haptics) {
        { chip ->
            MeeshyChipRowTrigger.perform(
                response = MeeshyChipRowRule.response(latestSelection.value, chip.id, mode, chip.kind),
                tapped = chip.id,
                isEnabled = true,
                haptic = haptic,
                play = { haptics.light() },
                onChange = { next, tapped -> latestOnChange.value(next, tapped) },
                onAction = { tapped -> latestOnAction.value?.invoke(tapped) },
            )
        }
    }
    val groupModifier = modifier
        .then(if (mode == MeeshyChipRowMode.Single || mode == MeeshyChipRowMode.SingleOrNone) Modifier.selectableGroup() else Modifier)
        .semantics { contentDescription = label }
    val cell: @Composable (MeeshyChip<T>, Modifier) -> Unit = { chip, cellModifier ->
        MeeshyChipCell(
            chip = chip,
            isSelected = mode != MeeshyChipRowMode.Actions && chip.kind == MeeshyChipKind.Choice && chip.id in selection,
            mode = mode,
            semantics = semantics,
            surface = surface,
            size = size,
            enabled = enabled,
            fillsWidth = layout == MeeshyChipRowLayout.Equal,
            forcedPressed = pressedChip != null && pressedChip == chip.id,
            onActivate = activate,
            modifier = cellModifier,
            chipLabel = chipLabel,
        )
    }

    when (layout) {
        MeeshyChipRowLayout.Scroll -> ScrollingChips(groupModifier, chips, selection, inset, revealsSelection, cell)
        MeeshyChipRowLayout.Wrap -> FlowRow(
            modifier = groupModifier.padding(horizontal = inset),
            horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.xsPlus),
        ) { chips.forEach { chip -> key(chip.id) { cell(chip, Modifier) } } }
        MeeshyChipRowLayout.Equal -> Row(
            modifier = groupModifier.fillMaxWidth().padding(horizontal = inset),
            horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.xsPlus),
        ) { chips.forEach { chip -> key(chip.id) { cell(chip, Modifier.weight(1f)) } } }
    }
}

/**
 * La rangée qui défile : un seul calque hors écran, et seulement s'il y a débordement ; jamais de barre. La courante est
 * centrée à l'apparition (sans animation) et à chaque changement (250 ms, immédiat sous « réduire les animations »).
 */
@Composable
private fun <T> ScrollingChips(
    modifier: Modifier,
    chips: List<MeeshyChip<T>>,
    selection: Set<T>,
    inset: Dp,
    revealsSelection: Boolean,
    cell: @Composable (MeeshyChip<T>, Modifier) -> Unit,
) {
    val scroll = rememberScrollState()
    val reduceMotion = LocalReduceMotion.current
    val isRightToLeft = LocalLayoutDirection.current == LayoutDirection.Rtl
    val density = LocalDensity.current
    val geometry = remember { ChipRowGeometry<T>() }
    val fades = rememberEdgeFades(scroll, reduceMotion)

    if (revealsSelection) {
        val latestChips = rememberUpdatedState(chips)
        LaunchedEffect(selection, reduceMotion) {
            val target = MeeshyChipRowRule.revealTarget(latestChips.value.map { it.id }, geometry.previous, selection)
            val isFirst = geometry.isFirstReveal
            geometry.previous = selection
            geometry.isFirstReveal = false
            if (target == null) return@LaunchedEffect
            if (isFirst) snapshotFlow { scroll.maxValue }.first { it != Int.MAX_VALUE }
            val offset = geometry.centeredOffset(
                order = latestChips.value.map { it.id },
                target = target,
                insetPx = with(density) { inset.toPx() },
                gapPx = with(density) { MeeshySpacing.xsPlus.toPx() },
                maxValue = scroll.maxValue,
            ) ?: return@LaunchedEffect
            if (isFirst || reduceMotion) scroll.scrollTo(offset) else scroll.animateScrollTo(offset, tween(durationMillis = MeeshyChipRecipe.REVEAL_MILLIS))
        }
    }

    Row(
        modifier = modifier
            .fadingEdges(fades, isRightToLeft)
            .onSizeChanged { geometry.viewportPx = it.width }
            .horizontalScroll(scroll)
            .padding(horizontal = inset),
        horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.xsPlus),
    ) {
        chips.forEach { chip ->
            key(chip.id) {
                val measured = remember(geometry, chip.id) { Modifier.onSizeChanged { geometry.widths[chip.id] = it.width } }
                cell(chip, measured)
            }
        }
    }
}

/**
 * Ce que le défilement a besoin de savoir pour centrer une puce, sans rien observer : la largeur mesurée de chaque puce et
 * celle de la fenêtre, écrites à la mesure (jamais lues en composition). Rien n'est retenu hors de la rangée.
 */
internal class ChipRowGeometry<T> {
    val widths: MutableMap<T, Int> = HashMap()
    var viewportPx: Int = 0
    var previous: Set<T> = emptySet()
    var isFirstReveal: Boolean = true

    /**
     * Le décalage qui centre [target] dans la fenêtre, borné à la course du défilement. Les distances sont LOGIQUES (du
     * début vers la fin) : elles valent en RTL, où le défilement lui-même est miroité. `null` si la puce n'est pas mesurée.
     */
    fun centeredOffset(order: List<T>, target: T, insetPx: Float, gapPx: Float, maxValue: Int): Int? {
        val index = order.indexOf(target)
        val width = widths[target]
        if (index < 0 || width == null) return null
        val before = order.take(index).sumOf { widths[it] ?: 0 } + gapPx * index
        val center = insetPx + before + width / 2f
        return (center - viewportPx / 2f).roundToInt().coerceIn(0, maxOf(0, maxValue))
    }
}

@Composable
private fun rememberEdgeFades(scroll: ScrollState, reduceMotion: Boolean): EdgeFades {
    val fades = remember { EdgeFades(Animatable(0f), Animatable(0f)) }
    LaunchedEffect(scroll, reduceMotion) {
        val spec: AnimationSpec<Float> = if (reduceMotion) snap() else tween(durationMillis = MeeshyChipRecipe.EDGE_FADE_MILLIS)
        snapshotFlow { scrollEdgesOf(scroll.value, scroll.maxValue) }.collectLatest { edges ->
            coroutineScope {
                launch { fades.start.animateTo(if (edges.start) 1f else 0f, spec) }
                launch { fades.end.animateTo(if (edges.end) 1f else 0f, spec) }
            }
        }
    }
    return fades
}

/** Les bords d'un défilement : la course (`maxValue`) vaut le contenu moins la fenêtre, l'inconnu (`Int.MAX_VALUE`) ne cache rien. */
internal fun scrollEdgesOf(value: Int, maxValue: Int): MeeshyScrollEdges =
    if (maxValue == Int.MAX_VALUE) MeeshyScrollEdges.None else MeeshyScrollEdges.of(content = maxValue.toFloat(), viewport = 0f, offset = value.toFloat())
