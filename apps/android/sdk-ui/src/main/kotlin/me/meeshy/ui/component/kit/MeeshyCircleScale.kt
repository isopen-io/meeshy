package me.meeshy.ui.component.kit

import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsPressedAsState
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.PathEffect
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.stateDescription
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import me.meeshy.ui.R
import me.meeshy.ui.accessibility.LocalReduceMotion
import me.meeshy.ui.accessibility.decorative
import me.meeshy.ui.haptics.MeeshyHaptics
import me.meeshy.ui.haptics.rememberMeeshyHaptics
import me.meeshy.ui.theme.MeeshyMotion
import me.meeshy.ui.theme.MeeshyMotionToken
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshyTheme

private val InkOnFull = MeeshyPalette.Indigo950
private const val PILL_BORDER_ALPHA = 0.62f
private const val HALO_GAP_DP = 3
private const val DASH_ON_DP = 6f
private const val DASH_OFF_DP = 5f
private const val GLOW_ALPHA = 0.2f

/** Un niveau, tel que l'hôte le nomme : titre déjà traduit et glyphe du jeu (K33). */
public data class MeeshyCircleScaleLevel(val title: String, val icon: ImageVector)

/**
 * **Un niveau de proximité se lit par l'intensité** (K33) : une seule teinte, de plus en plus pleine — le niveau le plus bas
 * n'a qu'un contour, le plus haut est plein. Trois formes d'un même composant et d'une seule loi ([MeeshyCircleScaleRecipe.intensity]) :
 * [MeeshyCircleScaleForm.Dots] (pastilles à compte), [MeeshyCircleScaleForm.Pill] (glyphe et nom du niveau courant) et
 * [MeeshyCircleScaleForm.Rings] (anneaux, le courant allumé, [center] au milieu et [marker] posé sur l'anneau allumé).
 *
 * Il montre un rang, il ne sait pas ce qu'on range : l'hôte nomme les 2 à 8 [levels], donne [current] (null : aucun, les
 * pastilles de « Mes cercles ») et la [tint]. L'intensité ne porte jamais le sens seule : le niveau est dit en mots, « Ami, 5 sur
 * 6 ». Sans [onSelect] rien ne se touche ; avec lui chaque pastille, ou la pilule, devient un bouton à cible de 48 dp, et un
 * choix qui change de niveau joue un tic. Jumeau iOS : `MeeshyCircleScale`.
 */
@Composable
@Suppress("LongParameterList", "LongMethod")
public fun MeeshyCircleScale(
    levels: List<MeeshyCircleScaleLevel>,
    current: Int?,
    modifier: Modifier = Modifier,
    form: MeeshyCircleScaleForm = MeeshyCircleScaleForm.Pill,
    size: MeeshyCircleScaleSize = MeeshyCircleScaleSize.Regular,
    other: Int? = null,
    counts: List<Int>? = null,
    tint: Color? = null,
    otherTint: Color? = null,
    showsTitles: Boolean = true,
    enabled: Boolean = true,
    haptic: MeeshyCircleScaleHaptic = MeeshyCircleScaleHaptic.OnChange,
    center: (@Composable () -> Unit)? = null,
    marker: (@Composable () -> Unit)? = null,
    onSelect: ((Int) -> Unit)? = null,
) {
    val interaction = remember { MutableInteractionSource() }
    val pressed by interaction.collectIsPressedAsState()
    val values = MeeshyCircleScaleRecipe.resolve(levels.size, current, other, form, size, pressed && onSelect != null, enabled)
    if (!values.isRendered) return
    val reduce = LocalReduceMotion.current
    val haptics = rememberMeeshyHaptics()
    val accent = tint ?: MeeshyPalette.Indigo500
    val locale = LocalConfiguration.current.locales[0]
    val shownCounts = MeeshyCircleScaleRecipe.validCounts(counts, levels.size)?.map { MeeshyCircleScaleRecipe.countText(it, locale) }
    val choose: ((Int) -> Unit)? = onSelect?.takeIf { enabled }?.let { select ->
        { chosen ->
            if (MeeshyCircleScaleRecipe.playsHaptic(haptic, chosen, values.litLevel, reduce)) playTick(haptics, chosen, values.litLevel)
            select(chosen)
        }
    }
    val body = modifier.graphicsLayer { scaleX = values.pressedScale; scaleY = values.pressedScale }.alpha(values.opacity)
    when (form) {
        MeeshyCircleScaleForm.Pill -> ScalePill(levels, values, size, accent, interaction, choose, body)
        MeeshyCircleScaleForm.Dots -> ScaleDots(levels, values, size, accent, shownCounts, showsTitles, choose, body)
        MeeshyCircleScaleForm.Rings -> ScaleRings(levels, values, accent, otherTint ?: MeeshyTheme.tokens.textSecondary, showsTitles, center, marker, body)
    }
}

private fun playTick(haptics: MeeshyHaptics, chosen: Int, current: Int?) {
    if (current != null && chosen < current) haptics.light() else haptics.medium()
}

@Composable
private fun levelFill(accent: Color, intensity: Float): Color {
    val reduce = LocalReduceMotion.current
    val animated by animateFloatAsState(intensity, MeeshyMotion.spec(MeeshyMotionToken.Morph, reduce), label = "circle-scale-intensity")
    return accent.copy(alpha = animated)
}

@Composable
private fun spokenLevel(levels: List<MeeshyCircleScaleLevel>, level: Int): String =
    "${levels[level].title}, ${stringResource(R.string.kit_circle_scale_value, level + 1, levels.size)}"

@Composable
@Suppress("LongParameterList")
private fun ScalePill(
    levels: List<MeeshyCircleScaleLevel>,
    values: MeeshyCircleScaleValues,
    size: MeeshyCircleScaleSize,
    accent: Color,
    interaction: MutableInteractionSource,
    choose: ((Int) -> Unit)?,
    modifier: Modifier,
) {
    val level = values.litLevel ?: return
    val intensity = MeeshyCircleScaleRecipe.intensity(level, levels.size)
    val fill = levelFill(accent, intensity)
    val ink = if (MeeshyCircleScaleRecipe.usesDarkInk(intensity)) InkOnFull else MeeshyTheme.tokens.textPrimary
    val shape = RoundedCornerShape(percent = 50)
    val spoken = spokenLevel(levels, level)
    Row(
        modifier = modifier
            .heightIn(min = values.pillHeightDp.dp)
            .clip(shape)
            .background(fill)
            .border(1.5.dp, accent.copy(alpha = PILL_BORDER_ALPHA), shape)
            .let { if (choose != null) it.clickable(interactionSource = interaction, indication = null, role = Role.Button) { choose(level) } else it }
            .padding(horizontal = if (size == MeeshyCircleScaleSize.Compact) 10.dp else 14.dp)
            .semantics(mergeDescendants = true) { contentDescription = spoken },
        horizontalArrangement = Arrangement.spacedBy(6.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(levels[level].icon, contentDescription = null, tint = ink, modifier = Modifier.size(16.dp))
        Text(levels[level].title, color = ink, fontSize = if (size == MeeshyCircleScaleSize.Compact) 12.sp else 14.sp, fontWeight = FontWeight.Bold, maxLines = 1)
    }
}

@Composable
@Suppress("LongParameterList", "LongMethod")
private fun ScaleDots(
    levels: List<MeeshyCircleScaleLevel>,
    values: MeeshyCircleScaleValues,
    size: MeeshyCircleScaleSize,
    accent: Color,
    counts: List<String>?,
    showsTitles: Boolean,
    choose: ((Int) -> Unit)?,
    modifier: Modifier,
) {
    val tokens = MeeshyTheme.tokens
    val isSteps = size == MeeshyCircleScaleSize.Compact
    Row(modifier, Arrangement.spacedBy(values.stepGapDp.dp), Alignment.Top) {
        levels.forEachIndexed { index, level ->
            val intensity = MeeshyCircleScaleRecipe.intensity(index, levels.size)
            val lit = index == values.litLevel
            val aboveCurrent = values.litLevel != null && index > values.litLevel
            val fill = levelFill(accent, if (isSteps && aboveCurrent) 0f else intensity)
            val ink = if (MeeshyCircleScaleRecipe.usesDarkInk(intensity)) InkOnFull else tokens.textPrimary
            val spoken = spokenLevel(levels, index)
            val cell = Modifier
                .let { if (choose != null) it.clickable(role = Role.Button) { choose(index) } else it }
                .semantics(mergeDescendants = true) {
                    contentDescription = if (counts != null) "${level.title}, ${counts[index]}" else spoken
                    stateDescription = spoken
                    selected = lit
                }
            if (isSteps) {
                Box(
                    cell.size(width = values.stepHeightDp.dp * 2, height = values.stepHeightDp.dp)
                        .clip(CircleShape).background(fill).border(1.5.dp, accent, CircleShape),
                )
            } else {
                Column(cell.widthIn(min = values.dotDiameterDp.dp), Arrangement.spacedBy(4.dp), Alignment.CenterHorizontally) {
                    Box(Modifier.size(values.dotDiameterDp.dp + (HALO_GAP_DP * 2 + 4).dp), contentAlignment = Alignment.Center) {
                        if (lit) Box(Modifier.size(values.dotDiameterDp.dp + (HALO_GAP_DP * 2 + 4).dp).border(2.dp, accent, CircleShape).decorative())
                        Box(
                            Modifier.size(values.dotDiameterDp.dp).clip(CircleShape).background(fill).border(1.5.dp, accent, CircleShape),
                            contentAlignment = Alignment.Center,
                        ) {
                            val text = counts?.get(index)
                            if (text != null) {
                                Text(text, color = ink, fontSize = 18.sp, fontWeight = FontWeight.Black, style = TextStyle(fontFeatureSettings = "tnum"))
                            } else {
                                Icon(level.icon, contentDescription = null, tint = ink, modifier = Modifier.size(22.dp))
                            }
                        }
                    }
                    if (showsTitles) {
                        Text(
                            level.title, color = if (lit) tokens.textPrimary else tokens.textSecondary, fontSize = 10.sp,
                            fontWeight = if (lit) FontWeight.ExtraBold else FontWeight.SemiBold, textAlign = TextAlign.Center, maxLines = 1,
                            overflow = TextOverflow.Clip,
                        )
                    }
                }
            }
        }
    }
}

@Composable
@Suppress("LongParameterList", "LongMethod")
private fun ScaleRings(
    levels: List<MeeshyCircleScaleLevel>,
    values: MeeshyCircleScaleValues,
    accent: Color,
    otherInk: Color,
    showsTitles: Boolean,
    center: (@Composable () -> Unit)?,
    marker: (@Composable () -> Unit)?,
    modifier: Modifier,
) {
    val tokens = MeeshyTheme.tokens
    val count = levels.size
    val outerRadius = values.centerDiameterDp / 2 + values.ringGapDp * count
    val side = (outerRadius * 2 + values.glowRadiusDp).dp
    val spoken = values.litLevel?.let { spokenLevel(levels, it) } ?: ""
    Row(modifier.semantics(mergeDescendants = true) { contentDescription = spoken }, Arrangement.spacedBy(16.dp), Alignment.CenterVertically) {
        Box(Modifier.size(side), contentAlignment = Alignment.Center) {
            Canvas(Modifier.size(side).decorative()) {
                val c = Offset(size.width / 2, size.height / 2)
                fun radius(level: Int) = (values.centerDiameterDp / 2 + values.ringGapDp * (count - level)).dp.toPx()
                for (level in 0 until count) {
                    val isLit = level == values.litLevel
                    val isOther = level == values.otherLevel && !isLit
                    when {
                        isLit -> {
                            drawCircle(accent.copy(alpha = GLOW_ALPHA), radius(level), c, style = Stroke(values.glowRadiusDp.dp.toPx() / 2))
                            drawCircle(accent, radius(level), c, style = Stroke(values.litRingStrokeDp.dp.toPx()))
                        }
                        isOther -> drawCircle(
                            otherInk, radius(level), c,
                            style = Stroke(values.ringStrokeDp.dp.toPx(), pathEffect = PathEffect.dashPathEffect(floatArrayOf(DASH_ON_DP.dp.toPx(), DASH_OFF_DP.dp.toPx()))),
                        )
                        else -> drawCircle(
                            accent.copy(alpha = 0.25f + MeeshyCircleScaleRecipe.intensity(level, count) * 0.5f), radius(level), c,
                            style = Stroke(values.ringStrokeDp.dp.toPx()),
                        )
                    }
                }
            }
            center?.let { Box(Modifier.size(values.centerDiameterDp.dp), contentAlignment = Alignment.Center) { it() } }
            val litLevel = values.litLevel
            if (marker != null && litLevel != null) {
                val ringRadius = values.centerDiameterDp / 2 + values.ringGapDp * (count - litLevel)
                Box(Modifier.offset(y = -ringRadius.dp).size(values.markerDiameterDp.dp), contentAlignment = Alignment.Center) { marker() }
            }
        }
        if (showsTitles) {
            Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                levels.indices.reversed().forEach { level ->
                    val lit = level == values.litLevel
                    Text(
                        levels[level].title, color = if (lit) accent else tokens.textSecondary, fontSize = 12.sp,
                        fontWeight = if (lit) FontWeight.ExtraBold else FontWeight.Medium, maxLines = 1,
                    )
                }
            }
        }
    }
}
