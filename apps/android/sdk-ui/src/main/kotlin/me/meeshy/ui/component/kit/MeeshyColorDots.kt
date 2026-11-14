package me.meeshy.ui.component.kit

import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.snap
import androidx.compose.foundation.background
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.hoverable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsFocusedAsState
import androidx.compose.foundation.interaction.collectIsHoveredAsState
import androidx.compose.foundation.interaction.collectIsPressedAsState
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.selection.selectableGroup
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.Icon
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.drawWithContent
import androidx.compose.ui.graphics.BlendMode
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.CompositingStrategy
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.layout.layout
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.LocalLayoutDirection
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.LayoutDirection
import androidx.compose.ui.unit.dp
import me.meeshy.ui.R
import me.meeshy.ui.accessibility.LocalReduceMotion
import me.meeshy.ui.haptics.rememberMeeshyHaptics
import me.meeshy.ui.theme.MeeshyAdaptiveColors
import me.meeshy.ui.theme.MeeshyBorder
import me.meeshy.ui.theme.MeeshyMediaChromeColors
import me.meeshy.ui.theme.MeeshyMotion
import me.meeshy.ui.theme.MeeshyTheme

/**
 * **Un groupe de choix unique : des disques dont un seul est courant, cerclé** (K07). Miroir de `MeeshyColorDots` (iOS).
 *
 * Ni palette, ni titre visible, ni verre : l'hôte passe les pastilles, leur nom et la courante. Toucher une pastille rappelle
 * [onSelect] une fois, au relâcher dans la cible ; retoucher la courante le rappelle aussi. [trailing] porte une action qui
 * n'est pas un choix (« Aléatoire ») : elle se pose dans le flux, après la dernière pastille, dans une cellule de 48 dp, hors
 * du groupe de choix. Une liste vide ne rend rien. [enabled] à faux : contenu à 40 %, ni action ni haptique.
 * [pressedDot] fige le pré-cercle d'une pastille : l'instantané et le catalogue ne tiennent pas un doigt sur l'écran
 * (`previewPressed` d'iOS).
 *
 * La disposition se calcule une fois par largeur (un [BoxWithConstraints] lit la largeur proposée, aucune mesure par
 * pastille). Un `Row` qui déborde défile et s'estompe au bord de fin de sa fenêtre ; il se cale sur la courante, sans
 * animation à l'apparition, au ressort ensuite, immédiatement sous « réduire les animations ». Le cercle, le filet et
 * l'anneau de focus se lisent en phase de DESSIN : un choix ne recompose que les deux pastilles qui changent, et aucune
 * image de la transition ne recompose.
 */
@Composable
public fun MeeshyColorDots(
    dots: List<MeeshyColorDot>,
    label: String,
    modifier: Modifier = Modifier,
    selection: String? = null,
    size: MeeshyColorDotSize = MeeshyColorDotSize.S28,
    layout: MeeshyColorDotsLayout = MeeshyColorDotsLayout.Wrap,
    tone: MeeshyGlassTone? = null,
    haptic: MeeshyColorDotHaptic = MeeshyGlassButtonHaptic.Light,
    enabled: Boolean = true,
    pressedDot: String? = null,
    onSelect: (String) -> Unit,
    trailing: (@Composable () -> Unit)? = null,
) {
    if (dots.isEmpty()) return
    assert(label.isNotEmpty()) { "MeeshyColorDots : le nom du groupe est obligatoire et non vide" }
    val effectiveTone = tone ?: LocalMeeshyGlassTone.current
    val isDark = MeeshyTheme.isDark
    val reduceMotion = LocalReduceMotion.current
    val isRtl = LocalLayoutDirection.current == LayoutDirection.Rtl
    val density = LocalDensity.current
    val locale = LocalConfiguration.current.locales[0]
    val haptics = rememberMeeshyHaptics()
    val play: (MeeshyGlassButtonHaptic) -> Unit = remember(haptics) { { _ -> haptics.light() } }
    val scrollState = rememberScrollState()
    val placement = remember { MeeshyColorDotsPlacement() }
    val trailingCount = if (trailing != null) 1 else 0
    val positionTemplate = stringResource(R.string.kit_color_dots_position)

    BoxWithConstraints(modifier = modifier.selectableGroup().semantics { contentDescription = label }) {
        val recipe = MeeshyColorDotsRecipe.resolve(
            count = dots.size + trailingCount,
            available = maxWidth.value.toDouble(),
            size = size,
            layout = layout,
            tone = effectiveTone,
        )
        val groupInk = when (recipe.ink) {
            MeeshyColorDotsInk.OnMedia -> MeeshyMediaChromeColors.OnMedia
            MeeshyColorDotsInk.ThemeInk -> MeeshyAdaptiveColors.textPrimary(isDark)
        }
        val selectedIndex = dots.indexOfFirst { MeeshyColorDotsRecipe.isCurrent(it.id, selection) }
        val viewport = maxWidth.value.toDouble() + 2 * recipe.inset
        val targetPx = with(density) {
            MeeshyColorDotsRecipe.scrollTarget(selectedIndex, recipe.cell, viewport).toFloat().dp.roundToPx()
        }
        LaunchedEffect(selection, recipe.scrolls) {
            if (!recipe.scrolls || selectedIndex < 0) return@LaunchedEffect
            if (placement.isFirst || reduceMotion) scrollState.scrollTo(targetPx) else scrollState.animateScrollTo(targetPx)
            placement.isFirst = false
        }

        val content: @Composable () -> Unit = {
            Box(modifier = Modifier.size(recipe.size.width.toFloat().dp, recipe.size.height.toFloat().dp)) {
                dots.forEachIndexed { index, dot ->
                    MeeshyColorDotButton(
                        dot = dot,
                        name = MeeshyColorDotsWords.spokenName(dot, index, dots.size) { rank, total ->
                            MeeshyColorDotsWords.position(rank - 1, total, locale, positionTemplate)
                        },
                        isSelected = MeeshyColorDotsRecipe.isCurrent(dot.id, selection),
                        isPressedPreview = pressedDot != null && pressedDot == dot.id,
                        recipe = recipe,
                        origin = recipe.cellOrigin(index),
                        ink = groupInk,
                        enabled = enabled,
                        haptic = haptic,
                        play = play,
                        reduceMotion = reduceMotion,
                        onSelect = onSelect,
                    )
                }
                trailing?.let { action ->
                    val origin = recipe.cellOrigin(dots.size)
                    Box(
                        modifier = Modifier.offset(x = origin.first.toFloat().dp, y = origin.second.toFloat().dp).size(recipe.cell.toFloat().dp),
                        contentAlignment = Alignment.Center,
                    ) { action() }
                }
            }
        }

        if (recipe.scrolls) {
            val inset = recipe.inset.toFloat().dp
            val fade = fadeBrush(isRtl)
            Box(
                modifier = Modifier
                    .bleed(inset)
                    .graphicsLayer { compositingStrategy = CompositingStrategy.Offscreen }
                    .drawWithContent {
                        drawContent()
                        drawRect(brush = fade(this.size.width), blendMode = BlendMode.DstIn)
                    }
                    .horizontalScroll(scrollState)
                    .padding(horizontal = inset),
            ) { content() }
        } else {
            content()
        }
    }
}

/** Le premier calage d'une ligne qui défile se fait sans animation ; ce fait n'est lu par aucun rendu. */
private class MeeshyColorDotsPlacement {
    var isFirst: Boolean = true
}

/**
 * Élargit la fenêtre de défilement de [inset] de chaque côté sans changer l'encombrement : la cible du premier et du
 * dernier disque déborde du contenu comme hors défilement, au lieu d'être rognée par la fenêtre (`.padding(-inset)` d'iOS).
 */
private fun Modifier.bleed(inset: Dp): Modifier = layout { measurable, constraints ->
    val extra = (inset * 2).roundToPx()
    val widened = if (constraints.hasBoundedWidth) {
        constraints.copy(minWidth = constraints.minWidth + extra, maxWidth = constraints.maxWidth + extra)
    } else {
        constraints
    }
    val placeable = measurable.measure(widened)
    layout((placeable.width - extra).coerceAtLeast(0), placeable.height) { placeable.place(-extra / 2, 0) }
}

/** Le masque de l'estompe du bord de fin : opaque jusqu'à [MeeshyColorDotsRecipe.FADE_START], puis transparent. */
private fun fadeBrush(isRtl: Boolean): (Float) -> Brush = { width ->
    val opaque = MeeshyMediaChromeColors.OnMedia
    val stops = arrayOf(
        0f to opaque,
        MeeshyColorDotsRecipe.FADE_START.toFloat() to opaque,
        1f to opaque.copy(alpha = 0f),
    )
    if (isRtl) {
        Brush.horizontalGradient(colorStops = stops, startX = width, endX = 0f)
    } else {
        Brush.horizontalGradient(colorStops = stops, startX = 0f, endX = width)
    }
}

/**
 * Une pastille : cible de la cellule, disque, filet, cercle de la courante. Pas de légende. Le cercle paraît au ressort
 * quand la courante change ; le pré-cercle du doigt posé paraît sans attendre (iOS : `.animation(_, value: isSelected)`).
 */
@Composable
private fun MeeshyColorDotButton(
    dot: MeeshyColorDot,
    name: String,
    isSelected: Boolean,
    isPressedPreview: Boolean,
    recipe: MeeshyColorDotsRecipe,
    origin: Pair<Double, Double>,
    ink: Color,
    enabled: Boolean,
    haptic: MeeshyGlassButtonHaptic,
    play: (MeeshyGlassButtonHaptic) -> Unit,
    reduceMotion: Boolean,
    onSelect: (String) -> Unit,
) {
    val source = remember { MutableInteractionSource() }
    val isPressed by source.collectIsPressedAsState()
    val isHovered by source.collectIsHoveredAsState()
    val isFocused by source.collectIsFocusedAsState()
    val selectedFraction by animateFloatAsState(
        targetValue = if (isSelected) 1f else 0f,
        animationSpec = if (reduceMotion) snap<Float>() else MeeshyMotion.springFast<Float>(),
        label = "meeshyColorDotRing",
    )
    val glyphTint = MeeshyColorDotsRecipe.glyphInk(dot.fill, ink)

    Box(
        modifier = Modifier
            .offset(x = origin.first.toFloat().dp, y = origin.second.toFloat().dp)
            .size(recipe.cell.toFloat().dp)
            .alpha(if (enabled) 1f else MeeshyColorDotsRecipe.DISABLED_OPACITY.toFloat())
            .hoverable(source)
            .selectable(
                selected = isSelected,
                enabled = enabled,
                role = Role.RadioButton,
                interactionSource = source,
                indication = null,
                onClick = {
                    MeeshyGlassButtonTrigger.perform(isEnabled = enabled, haptic = haptic, play = play) { onSelect(dot.id) }
                },
            )
            .semantics { contentDescription = name }
            .drawWithContent {
                drawContent()
                val pressed = isPressed || isPressedPreview
                val opacity = MeeshyColorDotsRecipe.ringOpacity(selectedFraction.toDouble(), pressed).toFloat()
                if (opacity > 0f) {
                    val scale = MeeshyColorDotsRecipe.ringScale(selectedFraction.toDouble(), pressed).toFloat()
                    val stroke = recipe.ringWidth.toFloat().dp.toPx() * scale
                    val radius = recipe.ringDiameter.toFloat().dp.toPx() / 2f * scale - stroke / 2f
                    drawCircle(color = ink, radius = radius, alpha = opacity, style = Stroke(width = stroke))
                }
            },
        contentAlignment = Alignment.Center,
    ) {
        Box(
            modifier = Modifier
                .size(recipe.diameter.toFloat().dp)
                .then(fillModifier(dot.fill))
                .drawWithContent {
                    drawContent()
                    val hairlineWidth = MeeshyBorder.regular.toPx()
                    val inner = this.size.minDimension / 2f - hairlineWidth / 2f
                    if (dot.fill == MeeshyColorDotFill.Hollow) {
                        drawCircle(
                            color = ink,
                            radius = inner,
                            alpha = MeeshyColorDotsRecipe.HAIRLINE_EMPHASIS_OPACITY.toFloat(),
                            style = Stroke(width = hairlineWidth),
                        )
                    }
                    val hairline = MeeshyColorDotsRecipe.hairline(isHovered = isHovered, increasedContrast = false).toFloat()
                    drawCircle(color = ink, radius = inner, alpha = hairline, style = Stroke(width = hairlineWidth))
                    if (isFocused) {
                        val focusWidth = MeeshyGlassButtonRecipe.FOCUS_RING_WIDTH_DP.dp.toPx()
                        val offset = MeeshyGlassButtonRecipe.FOCUS_RING_OFFSET_DP.dp.toPx()
                        drawCircle(color = ink, radius = this.size.minDimension / 2f + offset + focusWidth / 2f, style = Stroke(width = focusWidth))
                    }
                },
            contentAlignment = Alignment.Center,
        ) {
            dot.icon?.let { icon ->
                Icon(
                    imageVector = icon,
                    contentDescription = null,
                    tint = glyphTint,
                    modifier = Modifier.size((recipe.diameter * MeeshyColorDotsRecipe.GLYPH_SCALE).toFloat().dp),
                )
            }
        }
    }
}

/** Le fond d'une pastille : uni, dégradé (un seul arrêt se peint uni), ou creux (sans fond, son filet se dessine à 60 %). */
private fun fillModifier(fill: MeeshyColorDotFill): Modifier = when (fill) {
    is MeeshyColorDotFill.Solid -> Modifier.background(fill.color, CircleShape)
    is MeeshyColorDotFill.Gradient -> when (fill.colors.size) {
        0 -> Modifier
        1 -> Modifier.background(fill.colors.first(), CircleShape)
        else -> Modifier.background(Brush.horizontalGradient(fill.colors), CircleShape)
    }
    MeeshyColorDotFill.Hollow -> Modifier
}
