package me.meeshy.ui.component.kit

import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.snap
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.hoverable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsFocusedAsState
import androidx.compose.foundation.interaction.collectIsHoveredAsState
import androidx.compose.foundation.interaction.collectIsPressedAsState
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.selection.selectableGroup
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.Icon
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawWithContent
import androidx.compose.ui.graphics.BlendMode
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.CompositingStrategy
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.LocalLayoutDirection
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.LayoutDirection
import androidx.compose.ui.unit.dp
import me.meeshy.ui.accessibility.LocalReduceMotion
import me.meeshy.ui.haptics.rememberMeeshyHaptics
import me.meeshy.ui.R
import me.meeshy.ui.theme.MeeshyAdaptiveColors
import me.meeshy.ui.theme.MeeshyBorder
import me.meeshy.ui.theme.MeeshyMotion
import me.meeshy.ui.theme.MeeshyMediaChromeColors
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshyTheme

/**
 * **Un groupe de choix unique : des disques dont un seul est courant, cerclé** (K07). Miroir de `MeeshyColorDots` (iOS).
 *
 * Ni palette, ni titre visible, ni verre : l'hôte passe les pastilles, leur nom et la courante. Toucher une pastille rappelle
 * [onSelect] une fois, au relâcher dans la cible ; retoucher la courante le rappelle aussi. [trailing] porte une action qui
 * n'est pas un choix (« Aléatoire ») : elle se pose dans le flux, après la dernière pastille, dans une cellule de 48 dp, hors
 * du groupe de choix. Une liste vide ne rend rien. [enabled] à faux : contenu à 40 %, ni action ni haptique.
 *
 * La disposition se calcule une fois par largeur (un [BoxWithConstraints] lit la largeur proposée, aucune mesure par
 * pastille). Un `Row` qui déborde défile et s'estompe au bord de fin ; il se cale sur la courante, sans animation à
 * l'apparition, au ressort ensuite, immédiatement sous « réduire les animations ».
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
    haptic: MeeshyGlassButtonHaptic = MeeshyGlassButtonHaptic.Light,
    enabled: Boolean = true,
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
    val haptics = rememberMeeshyHaptics()
    val play: (MeeshyGlassButtonHaptic) -> Unit = remember(haptics) { { _ -> haptics.light() } }
    val scrollState = rememberScrollState()
    val isFirstPlacement = remember { mutableStateOf(true) }
    val trailingCount = if (trailing != null) 1 else 0
    val positionFormat = stringResource(R.string.kit_color_dots_position)

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
        val targetPx = with(density) {
            (selectedIndex * recipe.cell + recipe.cell / 2 - maxWidth.value / 2.0).coerceAtLeast(0.0).toFloat().dp.toPx()
        }
        LaunchedEffect(selection, recipe.scrolls) {
            if (!recipe.scrolls || selectedIndex < 0) return@LaunchedEffect
            if (isFirstPlacement.value || reduceMotion) scrollState.scrollTo(targetPx.toInt()) else scrollState.animateScrollTo(targetPx.toInt())
            isFirstPlacement.value = false
        }

        val content: @Composable () -> Unit = {
            Box(modifier = Modifier.size(recipe.size.width.toFloat().dp, recipe.size.height.toFloat().dp)) {
                dots.forEachIndexed { index, dot ->
                    val origin = recipe.cellOrigin(index)
                    MeeshyColorDotButton(
                        dot = dot,
                        name = MeeshyColorDotsWords.spokenName(dot, index, dots.size) { position, total ->
                            positionFormat.format(position, total)
                        },
                        isSelected = MeeshyColorDotsRecipe.isCurrent(dot.id, selection),
                        recipe = recipe,
                        origin = origin,
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
            val fade = fadeBrush(isRtl)
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .horizontalScroll(scrollState)
                    .graphicsLayer { compositingStrategy = CompositingStrategy.Offscreen }
                    .drawWithContent {
                        drawContent()
                        drawRect(brush = fade(size.width), blendMode = BlendMode.DstIn)
                    },
            ) { content() }
        } else {
            content()
        }
    }
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

/** Une pastille : cible de la cellule, disque, filet, cercle de la courante. Pas de légende. */
@Composable
private fun MeeshyColorDotButton(
    dot: MeeshyColorDot,
    name: String,
    isSelected: Boolean,
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
    val ringSpec = if (reduceMotion) snap<Float>() else MeeshyMotion.springFast<Float>()
    val ringScale by animateFloatAsState(
        targetValue = MeeshyColorDotsRecipe.ringScale(isSelected, isPressed).toFloat(),
        animationSpec = ringSpec,
        label = "meeshyColorDotRingScale",
    )
    val ringOpacity by animateFloatAsState(
        targetValue = MeeshyColorDotsRecipe.ringOpacity(isSelected, isPressed).toFloat(),
        animationSpec = ringSpec,
        label = "meeshyColorDotRingOpacity",
    )
    val hairline = MeeshyColorDotsRecipe.hairline(isHovered = isHovered, increasedContrast = false).toFloat()
    val stops = (dot.fill as? MeeshyColorDotFill.Solid)?.let { listOf(it.color) }
        ?: (dot.fill as? MeeshyColorDotFill.Gradient)?.colors
        ?: emptyList()
    val glyphTint = when {
        dot.fill == MeeshyColorDotFill.Hollow -> ink
        MeeshyColorDotsRecipe.glyphPrefersLight(stops) -> MeeshyMediaChromeColors.OnMedia
        else -> MeeshyPalette.Indigo950
    }
    val diameter: Dp = recipe.diameter.toFloat().dp
    val cellDp: Dp = recipe.cell.toFloat().dp
    val focusWidth = MeeshyColorDotsFocus.WIDTH_DP.dp

    Box(
        modifier = Modifier
            .offset(x = origin.first.toFloat().dp, y = origin.second.toFloat().dp)
            .size(cellDp)
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
            .semantics { contentDescription = name },
        contentAlignment = Alignment.Center,
    ) {
        Box(
            modifier = Modifier
                .size(diameter)
                .then(fillModifier(dot.fill))
                .border(MeeshyBorder.regular, ink.copy(alpha = hairline), CircleShape)
                .drawWithContent {
                    drawContent()
                    if (isFocused) {
                        val radius = this.size.minDimension / 2f + MeeshyColorDotsFocus.OFFSET_DP.dp.toPx() + focusWidth.toPx() / 2f
                        drawCircle(color = ink, radius = radius, style = Stroke(width = focusWidth.toPx()))
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
        Box(
            modifier = Modifier
                .size(recipe.ringDiameter.toFloat().dp)
                .graphicsLayer {
                    scaleX = ringScale
                    scaleY = ringScale
                }
                .border(recipe.ringWidth.toFloat().dp, ink.copy(alpha = ringOpacity), CircleShape),
        )
    }
}

/** Le fond d'une pastille : uni, dégradé ou creux (filet à 60 %, sans fond). */
private fun fillModifier(fill: MeeshyColorDotFill): Modifier = when (fill) {
    is MeeshyColorDotFill.Solid -> Modifier.background(fill.color, CircleShape)
    is MeeshyColorDotFill.Gradient -> Modifier.background(Brush.horizontalGradient(fill.colors), CircleShape)
    MeeshyColorDotFill.Hollow -> Modifier
}

/** Les mesures de l'anneau de focus clavier, celles de K02 (le focus ne se dessine que pour une cible au clavier). */
private object MeeshyColorDotsFocus {
    const val WIDTH_DP: Float = MeeshyGlassButtonRecipe.FOCUS_RING_WIDTH_DP
    const val OFFSET_DP: Float = MeeshyGlassButtonRecipe.FOCUS_RING_OFFSET_DP
}
