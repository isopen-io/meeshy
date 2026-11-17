package me.meeshy.ui.component.kit

import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.GenericShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.State
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.PathEffect
import androidx.compose.ui.graphics.Shape
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.drawscope.rotate
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlin.math.PI
import kotlin.math.cos
import kotlin.math.sin
import me.meeshy.ui.R
import me.meeshy.ui.accessibility.decorative
import me.meeshy.ui.icons.MeeshyIcons
import me.meeshy.ui.theme.MeeshyMotionRecipe
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshyTheme

private const val LOBE_DEPTH = 0.05f
private const val BLOB_STEPS = 96
private const val WAVE_MILLIS = 3000
private const val FULL_TURN = 360f
private const val WAVE_REACH = 2.3f

private val ScallopShape: Shape = GenericShape { size, _ ->
    val radius = size.minDimension / 2f
    val center = Offset(size.width / 2f, size.height / 2f)
    for (step in 0..BLOB_STEPS) {
        val angle = 2.0 * PI * step / BLOB_STEPS
        val r = radius * (1f - LOBE_DEPTH + LOBE_DEPTH * cos(MeeshyMedallionRecipe.SCALLOP_LOBES * angle).toFloat())
        val point = Offset(center.x + r * cos(angle).toFloat(), center.y + r * sin(angle).toFloat())
        if (step == 0) moveTo(point.x, point.y) else lineTo(point.x, point.y)
    }
    close()
}

private fun blobShape(phase: Float): Shape = GenericShape { size, _ ->
    val radius = size.minDimension / 2f
    val center = Offset(size.width / 2f, size.height / 2f)
    for (step in 0..BLOB_STEPS) {
        val angle = 2.0 * PI * step / BLOB_STEPS
        val wobble = 0.06f * sin(3 * angle + phase).toFloat() + 0.04f * cos(2 * angle - phase).toFloat()
        val r = radius * (0.92f + wobble)
        val point = Offset(center.x + r * cos(angle).toFloat(), center.y + r * sin(angle).toFloat())
        if (step == 0) moveTo(point.x, point.y) else lineTo(point.x, point.y)
    }
    close()
}

@Composable
private fun medallionBase(kind: MeeshyMedallionKind, tint: Color?): Color {
    val tokens = MeeshyTheme.tokens
    return tint ?: when (kind) {
        MeeshyMedallionKind.Accent -> MeeshyPalette.Indigo500
        MeeshyMedallionKind.Ok -> tokens.success
        MeeshyMedallionKind.Warn -> tokens.warning
        MeeshyMedallionKind.Err -> tokens.error
        MeeshyMedallionKind.Neutral -> tokens.textSecondary
    }
}

/**
 * **Le médaillon qui nomme sans se toucher** (K45) : un glyphe, ou une valeur de un à trois caractères, au centre d'une forme
 * teintée (disque, carré arrondi, festonnée, organique). Fond doux à 18 % de la teinte, ou aplat à encre sombre ; au plus un
 * décor (halo, anneau pointillé, trait barré, ondes) ; quatre états dont `locked`, qui ignore genre, fond et décor.
 *
 * Il n'a ni cible, ni état pressé, ni rôle de bouton : dans une rangée qui se touche, c'est la rangée. Un disque teinté qui
 * répond au doigt est un `MeeshyGlassButton`. Sans [label] il est caché à la voix. Le mouvement réduit fige la forme et ne
 * garde qu'une onde. Jumeau iOS : `MeeshyMedallion`.
 */
@Composable
@Suppress("LongParameterList", "LongMethod")
public fun MeeshyMedallion(
    modifier: Modifier = Modifier,
    icon: ImageVector? = null,
    value: String? = null,
    kind: MeeshyMedallionKind = MeeshyMedallionKind.Accent,
    tint: Color? = null,
    shape: MeeshyMedallionShape = MeeshyMedallionShape.Disc,
    fill: MeeshyMedallionFill = MeeshyMedallionFill.Soft,
    decor: MeeshyMedallionDecor = MeeshyMedallionDecor.None,
    size: MeeshyMedallionSize = MeeshyMedallionSize.S44,
    state: MeeshyMedallionState = MeeshyMedallionState.Normal,
    gradientEnd: Color? = null,
    surface: Color? = null,
    label: String? = null,
    isAnimated: Boolean = true,
    reduceMotion: Boolean = me.meeshy.ui.accessibility.LocalReduceMotion.current,
    glyph: (@Composable () -> Unit)? = null,
) {
    val values = MeeshyMedallionRecipe.resolve(shape, fill, decor, size, state, value != null, reduceMotion || !isAnimated, supportsShape = true)
    val base = medallionBase(kind, tint)
    val tokens = MeeshyTheme.tokens
    val ink = when (values.paint) {
        MeeshyMedallionPaint.Solid -> tokens.backgroundPrimary
        MeeshyMedallionPaint.Soft -> base
        MeeshyMedallionPaint.Outline -> tokens.textSecondary
    }
    val transition = rememberInfiniteTransition(label = "medallion")
    val animated = values.isAnimated
    val turn: State<Float>? = if (animated && values.decor == MeeshyMedallionDecor.Dashed) {
        transition.animateFloat(0f, FULL_TURN, infiniteRepeatable(tween(MeeshyMedallionRecipe.DASHED_TURN_MILLIS, easing = LinearEasing), RepeatMode.Restart), label = "dashed")
    } else {
        null
    }
    val wave: State<Float>? = if (animated && values.waveCount > 0) {
        transition.animateFloat(0f, 1f, infiniteRepeatable(tween(WAVE_MILLIS, easing = LinearEasing), RepeatMode.Restart), label = "waves")
    } else {
        null
    }
    val phase = if (values.drifts) {
        transition.animateFloat(0f, (2 * PI).toFloat(), infiniteRepeatable(tween(MeeshyMotionRecipe.FLOAT_MILLIS, easing = LinearEasing), RepeatMode.Restart), label = "blob").value
    } else {
        0f
    }
    val clipShape: Shape = when (values.shape) {
        MeeshyMedallionShape.Disc -> CircleShape
        MeeshyMedallionShape.Squircle -> RoundedCornerShape((values.diameterDp * MeeshyMedallionRecipe.SQUIRCLE_RADIUS_FRACTION).dp)
        MeeshyMedallionShape.Scallop -> ScallopShape
        MeeshyMedallionShape.Blob -> blobShape(phase)
    }
    val lockedName = stringResource(R.string.kit_medallion_locked)
    val spoken = if (MeeshyMedallionRecipe.isHiddenFromVoice(label)) null else if (state == MeeshyMedallionState.Locked) "$label, $lockedName" else label
    val background = when (values.paint) {
        MeeshyMedallionPaint.Solid -> base
        MeeshyMedallionPaint.Soft -> base.copy(alpha = values.softAlpha)
        MeeshyMedallionPaint.Outline -> Color.Transparent
    }
    Box(
        modifier = modifier
            .size(values.diameterDp.dp)
            .drawBehind { drawDecor(values, base, surface, turn?.value ?: 0f, wave?.value ?: 0f) }
            .clip(clipShape)
            .let { m ->
                if (gradientEnd != null && values.paint == MeeshyMedallionPaint.Solid) {
                    m.background(androidx.compose.ui.graphics.Brush.linearGradient(listOf(base, gradientEnd)))
                } else {
                    m.background(background)
                }
            }
            .let { if (values.hasBorder) it.border(1.5.dp, tokens.hairline, clipShape) else it }
            .let { if (spoken == null) it.decorative() else it.clearAndSetSemantics { contentDescription = spoken } },
        contentAlignment = Alignment.Center,
    ) {
        when {
            values.showsLock -> Icon(MeeshyIcons.Lock, contentDescription = null, tint = ink, modifier = Modifier.size(values.glyphDp.dp))
            value != null -> Text(value.take(3), color = ink, fontSize = with(LocalDensity.current) { values.valueDp.dp.toSp() }, fontWeight = FontWeight.Black, maxLines = 1)
            glyph != null -> Box(Modifier.size(values.glyphDp.dp), contentAlignment = Alignment.Center) { glyph() }
            icon != null -> Icon(icon, contentDescription = null, tint = ink, modifier = Modifier.size(values.glyphDp.dp))
        }
    }
}

private fun androidx.compose.ui.graphics.drawscope.DrawScope.drawDecor(
    values: MeeshyMedallionValues,
    base: Color,
    surface: Color?,
    turn: Float,
    wave: Float,
) {
    val d = size.minDimension
    val radius = d / 2f
    when (values.decor) {
        MeeshyMedallionDecor.None -> Unit
        MeeshyMedallionDecor.Halo -> drawCircle(base.copy(alpha = values.haloAlpha), radius + d * values.haloFraction)
        MeeshyMedallionDecor.Dashed -> rotate(turn) {
            drawCircle(
                color = base,
                radius = radius - d * values.dashedInsetFraction,
                style = Stroke(width = 1.5.dp.toPx(), cap = StrokeCap.Round, pathEffect = PathEffect.dashPathEffect(floatArrayOf(4.dp.toPx(), 5.dp.toPx()))),
            )
        }
        MeeshyMedallionDecor.Struck -> {
            val half = d * values.struckLengthFraction / 2f
            rotate(values.struckAngleDegrees) {
                val from = Offset(center.x - half, center.y)
                val to = Offset(center.x + half, center.y)
                surface?.let { drawLine(it, from, to, strokeWidth = (values.struckStrokeDp + 2 * values.cutoutDp).dp.toPx(), cap = StrokeCap.Round) }
                drawLine(base, from, to, strokeWidth = values.struckStrokeDp.dp.toPx(), cap = StrokeCap.Round)
            }
        }
        is MeeshyMedallionDecor.Waves -> repeat(values.waveCount) { ring ->
            val progress = (wave + ring.toFloat() / values.waveCount) % 1f
            val ringRadius = radius * (1f + (WAVE_REACH - 1f) * progress)
            drawCircle(base.copy(alpha = 0.5f * (1f - progress)), ringRadius, style = Stroke(width = 1.5.dp.toPx()))
        }
    }
}
