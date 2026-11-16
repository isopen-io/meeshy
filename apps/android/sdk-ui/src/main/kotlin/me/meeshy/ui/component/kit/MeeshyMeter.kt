package me.meeshy.ui.component.kit

import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.LinearOutSlowInEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawWithContent
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalLayoutDirection
import androidx.compose.ui.semantics.ProgressBarRangeInfo
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.progressBarRangeInfo
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.LayoutDirection
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import java.text.NumberFormat
import me.meeshy.ui.accessibility.LocalReduceMotion
import me.meeshy.ui.accessibility.decorative
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshyTheme

private const val ENTRY_MILLIS = 500
private const val INDETERMINATE_SEGMENT = 0.3f
private const val MARK_WIDTH_DP = 2

@Composable
private fun meterBase(kind: MeeshyMeterKind, tint: Color?): Color {
    val tokens = MeeshyTheme.tokens
    return tint ?: when (kind) {
        MeeshyMeterKind.Accent -> MeeshyPalette.Indigo500
        MeeshyMeterKind.Ok -> tokens.success
        MeeshyMeterKind.Warn -> tokens.warning
        MeeshyMeterKind.Err -> tokens.error
    }
}

/**
 * **La jauge qui se lit sans se régler** (K42) : une valeur connue sur un total connu. La part remplie grandit depuis le bord de
 * début sur une piste de 5, 8 ou 12 dp ; [MeeshyMeterForm.Stepped] la découpe en crans, [MeeshyMeterForm.Indeterminate] est une
 * barre sans valeur. Elle dit sa valeur deux fois : à l'œil (titre, texte de valeur, légendes de bord), à la voix par
 * [spokenValue] (« 23 sur 50 ») ou à défaut le pourcentage. Pleine, elle prend [fullKind] si l'hôte en donne un.
 *
 * Total nul ou négatif : rien n'est rendu. L'entrée se joue une fois (jamais en mouvement réduit), [entryIndex] la décale de
 * 100 ms par rangée. Aucune cible : une jauge ne se touche pas. L'hôte passe deux nombres et des mots déjà traduits.
 * Jumeau iOS : `MeeshyMeter`.
 */
@Composable
@Suppress("LongParameterList", "LongMethod")
public fun MeeshyMeter(
    value: Double,
    total: Double,
    label: String,
    modifier: Modifier = Modifier,
    form: MeeshyMeterForm = MeeshyMeterForm.Continuous,
    kind: MeeshyMeterKind = MeeshyMeterKind.Accent,
    tint: Color? = null,
    tintEnd: Color? = null,
    fullKind: MeeshyMeterKind? = null,
    size: MeeshyMeterSize = MeeshyMeterSize.S8,
    spokenValue: String? = null,
    title: String? = null,
    valueText: String? = null,
    startCaption: String? = null,
    endCaption: String? = null,
    marks: List<Float> = emptyList(),
    isStale: Boolean = false,
    enabled: Boolean = true,
    animatesOnAppear: Boolean = true,
    entryIndex: Int = 0,
    leading: (@Composable () -> Unit)? = null,
    trailing: (@Composable () -> Unit)? = null,
) {
    if (form != MeeshyMeterForm.Indeterminate && !MeeshyMeterFraction.isRendered(total)) return
    val reduce = LocalReduceMotion.current
    val isRtl = LocalLayoutDirection.current == LayoutDirection.Rtl
    val target = MeeshyMeterFraction.resolve(value, total)
    val shown = remember { Animatable(if (animatesOnAppear && MeeshyMeterRecipe.entersAnimated(null, target, reduce)) 0f else target) }
    LaunchedEffect(target, reduce) {
        if (reduce) {
            shown.snapTo(target)
        } else {
            kotlinx.coroutines.delay(MeeshyMeterRecipe.entryDelayMillis(entryIndex).toLong())
            shown.animateTo(target, tween(ENTRY_MILLIS, easing = LinearOutSlowInEasing))
        }
    }
    val values = MeeshyMeterRecipe.resolve(form, kind, fullKind, size, shown.value, isStale, enabled, isRtl, marks)
    val base = meterBase(values.kind, tint)
    val percent = NumberFormat.getPercentInstance()
    val spoken = MeeshyMeterRecipe.spokenValue(spokenValue, target) { percent.format(it.toDouble()) }
    val trackColor = MeeshyTheme.tokens.controlFill
    val fillBrush = if (tintEnd != null) Brush.horizontalGradient(listOf(base, tintEnd)) else Brush.horizontalGradient(listOf(base, base))

    Column(
        modifier = modifier
            .fillMaxWidth()
            .alpha(values.opacity)
            .semantics(mergeDescendants = true) {
                contentDescription = if (values.isIndeterminate) label else "$label, $spoken"
                progressBarRangeInfo = if (values.isIndeterminate) ProgressBarRangeInfo.Indeterminate else ProgressBarRangeInfo(target, 0f..1f)
            },
    ) {
        if (title != null || valueText != null) {
            Row(Modifier.fillMaxWidth().decorative(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.Bottom) {
                title?.let { Text(it, color = MeeshyTheme.tokens.textSecondary, fontSize = 11.sp, fontWeight = FontWeight.SemiBold) }
                valueText?.let { Text(it, color = MeeshyTheme.tokens.textPrimary, fontSize = 15.sp, fontWeight = FontWeight.ExtraBold, style = TextStyle(fontFeatureSettings = "tnum")) }
            }
        }
        Row(
            modifier = Modifier.fillMaxWidth().padding(top = if (title != null || valueText != null) 6.dp else 0.dp),
            horizontalArrangement = Arrangement.spacedBy(8.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            leading?.invoke()
            Box(Modifier.weight(1f).decorative()) {
                when {
                    values.isIndeterminate -> IndeterminateTrack(values, base, trackColor, reduce)
                    values.segmentCount > 0 -> SteppedTrack(values, base, trackColor)
                    else -> ContinuousTrack(values, fillBrush, trackColor)
                }
            }
            trailing?.invoke()
        }
        if (startCaption != null || endCaption != null) {
            Row(Modifier.fillMaxWidth().padding(top = 8.dp).decorative(), horizontalArrangement = Arrangement.SpaceBetween) {
                Text(startCaption.orEmpty(), color = MeeshyTheme.tokens.textSecondary, fontSize = 12.5f.sp)
                Text(endCaption.orEmpty(), color = MeeshyTheme.tokens.textSecondary, fontSize = 12.5f.sp)
            }
        }
    }
}

@Composable
private fun ContinuousTrack(values: MeeshyMeterValues, fill: Brush, trackColor: Color) {
    val markColor = MeeshyTheme.tokens.backgroundPrimary
    Box(
        modifier = Modifier
            .fillMaxWidth()
            .height(values.trackDp.dp)
            .clip(CircleShape)
            .background(trackColor)
            .drawWithContent {
                drawContent()
                values.markOffsets.forEach { offset ->
                    val x = size.width * offset
                    drawRect(markColor, Offset(x - MARK_WIDTH_DP.dp.toPx() / 2f, 0f), Size(MARK_WIDTH_DP.dp.toPx(), size.height))
                }
            },
        contentAlignment = Alignment.CenterStart,
    ) {
        if (values.fraction > 0f) {
            Box(
                Modifier
                    .fillMaxWidth(values.fraction)
                    .widthIn(min = values.minFillDp.dp)
                    .height(values.trackDp.dp)
                    .clip(CircleShape)
                    .background(fill),
            )
        }
    }
}

@Composable
private fun SteppedTrack(values: MeeshyMeterValues, base: Color, trackColor: Color) {
    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(values.segmentGapDp.dp)) {
        repeat(values.segmentCount) { index ->
            val filled = index < values.filledSegments
            Box(
                Modifier
                    .weight(1f)
                    .height(values.trackDp.dp)
                    .clip(CircleShape)
                    .background(if (filled) base else trackColor)
                    .let { if (filled) it else it.border(1.dp, MeeshyTheme.tokens.hairline, CircleShape) },
            )
        }
    }
}

@Composable
private fun IndeterminateTrack(values: MeeshyMeterValues, base: Color, trackColor: Color, reduce: Boolean) {
    val pass = if (reduce) {
        0.5f
    } else {
        rememberInfiniteTransition(label = "meter-pass").animateFloat(
            initialValue = 0f,
            targetValue = 1f,
            animationSpec = infiniteRepeatable(tween(MeeshyMeterRecipe.PASS_MILLIS, easing = LinearEasing), RepeatMode.Restart),
            label = "meter-pass-progress",
        ).value
    }
    Box(
        Modifier
            .fillMaxWidth()
            .height(values.trackDp.dp)
            .clip(CircleShape)
            .background(trackColor)
            .drawWithContent {
                drawContent()
                val segment = size.width * INDETERMINATE_SEGMENT
                val x = (size.width + segment) * pass - segment
                drawRoundRect(base, Offset(x, 0f), Size(segment, size.height), CornerRadius(size.height / 2f))
            },
    )
}
