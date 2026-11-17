package me.meeshy.ui.component.kit

import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInVertically
import androidx.compose.animation.slideOutVertically
import androidx.compose.animation.core.tween
import androidx.compose.animation.togetherWith
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.IntrinsicSize
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.key
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.StrokeJoin
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import me.meeshy.ui.accessibility.LocalReduceMotion
import me.meeshy.ui.icons.MeeshyIcons
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshyTheme

private const val ROLL_MILLIS = 220
private const val SKELETON_ALPHA = 0.14f

/**
 * **Un chiffre** (K34) : la valeur en grand, son unité dessous, au besoin une tendance et un accessoire (la mini-courbe).
 * « 1 284 clics » se lit d'un bloc.
 *
 * Agnostique : la valeur arrive DÉJÀ écrite (espaces, « 12 k », « 2,4 Go »), la tendance aussi. Sans valeur, « — » à l'encre
 * discrète et l'unité reste. Le squelette cède dès qu'une valeur existe. Les chiffres qui changent roulent (alignés par la fin),
 * jamais à l'apparition ni en mouvement réduit. Le chiffre n'est jamais à la teinte : son contraste ne dépend d'aucune teinte.
 * Jumeau iOS : `MeeshyFigure`.
 */
@Composable
@Suppress("LongParameterList", "LongMethod")
public fun MeeshyFigure(
    value: String?,
    unit: String,
    emptyLabel: String,
    modifier: Modifier = Modifier,
    trend: MeeshyFigureTrend? = null,
    size: MeeshyFigureSize = MeeshyFigureSize.Large,
    isLoading: Boolean = false,
    rolls: Boolean = true,
    accessory: (@Composable () -> Unit)? = null,
) {
    val tokens = MeeshyTheme.tokens
    val reduceMotion = LocalReduceMotion.current
    val values = remember(size, isLoading, value) { MeeshyFiguresRecipe.resolve(size, isLoading = isLoading, hasValue = !value.isNullOrEmpty()) }
    val shown = MeeshyFiguresRecipe.displayedValue(value)
    val hasValue = !value.isNullOrEmpty()
    Column(
        modifier.semantics(mergeDescendants = true) {
            contentDescription = MeeshyFiguresRecipe.spoken(value, unit, emptyLabel) + (trend?.let { ", ${it.text}" } ?: "")
        },
    ) {
        if (values.showsSkeleton) {
            Box(Modifier.width((values.fontSize * 2).dp).height(values.fontSize.dp).background(tokens.textMuted.copy(alpha = SKELETON_ALPHA), RoundedCornerShape(8.dp)))
        } else {
            Row(verticalAlignment = Alignment.Bottom) {
                val last = shown.length - 1
                shown.forEachIndexed { index, char ->
                    key(last - index) {
                        val color = if (hasValue) tokens.textPrimary else tokens.textMuted
                        val digit = char.isDigit() && rolls && !reduceMotion && hasValue
                        if (digit) {
                            AnimatedContent(
                                targetState = char,
                                transitionSpec = {
                                    (slideInVertically(tween(ROLL_MILLIS)) { it } + fadeIn(tween(ROLL_MILLIS))) togetherWith
                                        (slideOutVertically(tween(ROLL_MILLIS)) { -it } + fadeOut(tween(ROLL_MILLIS)))
                                },
                                label = "figure-digit",
                            ) { Text(it.toString(), color = color, fontSize = values.fontSize.sp, fontWeight = FontWeight.Bold) }
                        } else {
                            Text(char.toString(), color = color, fontSize = values.fontSize.sp, fontWeight = FontWeight.Bold)
                        }
                    }
                }
                if (accessory != null) {
                    Spacer(Modifier.width(MeeshyFiguresRecipe.SEPARATOR_GAP.dp))
                    accessory()
                }
            }
        }
        Text(unit, color = tokens.textSecondary, fontSize = MeeshyFiguresRecipe.UNIT_FONT_SIZE.sp)
        if (trend != null) {
            Row(Modifier.height(MeeshyFiguresRecipe.TREND_HEIGHT.dp), verticalAlignment = Alignment.CenterVertically) {
                val tone = when (trend) {
                    is MeeshyFigureTrend.Up -> tokens.success
                    is MeeshyFigureTrend.Down -> tokens.errorInk
                    is MeeshyFigureTrend.Flat -> tokens.textSecondary
                }
                val icon = when (trend.arrow) {
                    MeeshyFigureTrendArrow.UpRight -> MeeshyIcons.ArrowUpRight
                    MeeshyFigureTrendArrow.DownRight -> MeeshyIcons.ArrowDownRight
                    MeeshyFigureTrendArrow.Right -> MeeshyIcons.Forward
                }
                Icon(icon, contentDescription = null, tint = tone, modifier = Modifier.width(MeeshyFiguresRecipe.TREND_ARROW.dp).height(MeeshyFiguresRecipe.TREND_ARROW.dp))
                Spacer(Modifier.width(4.dp))
                Text(trend.text, color = tone, fontSize = 12.sp)
            }
        }
    }
}

/** Un chiffre de bande, en valeurs : ce que l'hôte range, sans type du domaine. */
public data class MeeshyFigureItem(val value: String?, val unit: String, val trend: MeeshyFigureTrend? = null)

/**
 * **La bande** (K34) : deux à quatre chiffres, tous de la même taille, séparés par des filets (jamais au bord). Sous 360 de
 * largeur la bande de quatre passe en compact ; aux grandes tailles de texte, elle s'empile et les filets se couchent. UN élément
 * pour TalkBack. Avec [onPress], toute la bande est un bouton.
 */
@Composable
@Suppress("LongParameterList")
public fun MeeshyFigureBand(
    items: List<MeeshyFigureItem>,
    emptyLabel: String,
    modifier: Modifier = Modifier,
    size: MeeshyFigureSize = MeeshyFigureSize.Large,
    isLoading: Boolean = false,
    onPress: (() -> Unit)? = null,
) {
    val tokens = MeeshyTheme.tokens
    val scale = LocalDensity.current.fontScale
    val spoken = MeeshyFiguresRecipe.spokenBand(items.map { MeeshyFiguresRecipe.spoken(it.value, it.unit, emptyLabel) })
    BoxWithConstraints(
        modifier
            .fillMaxWidth()
            .then(if (onPress != null) Modifier.clickable(role = Role.Button, onClick = onPress) else Modifier)
            .semantics(mergeDescendants = true) { contentDescription = spoken },
    ) {
        val values = MeeshyFiguresRecipe.resolve(size, items.size, maxWidth.value.toDouble(), isLoading, hasValue = items.any { !it.value.isNullOrEmpty() })
        val stacked = scale >= 1.6f
        val cell: @Composable (MeeshyFigureItem, Modifier) -> Unit = { item, cellModifier ->
            MeeshyFigure(item.value, item.unit, emptyLabel, cellModifier.clearAndSetSemantics { }, item.trend, values.size, isLoading)
        }
        if (stacked) {
            Column(verticalArrangement = Arrangement.spacedBy(MeeshyFiguresRecipe.SEPARATOR_GAP.dp)) {
                items.forEachIndexed { index, item ->
                    cell(item, Modifier)
                    if (index < items.lastIndex) Box(Modifier.fillMaxWidth().height(1.dp).background(tokens.hairline))
                }
            }
        } else {
            Row(Modifier.height(IntrinsicSize.Min), verticalAlignment = Alignment.Bottom) {
                items.forEachIndexed { index, item ->
                    cell(item, Modifier.weight(1f))
                    if (index < items.lastIndex) {
                        Box(Modifier.padding(horizontal = MeeshyFiguresRecipe.SEPARATOR_GAP.dp / 2).width(1.dp).fillMaxHeight().background(tokens.hairline))
                    }
                }
            }
        }
    }
}

/**
 * **La mini-courbe** (K34) : ni axe ni graduation, un trait de 2 arrondi, l'aire à 14 % et le point final de 6. Une série plus
 * longue ou à axe va à K50. Elle a une PHRASE pour nom ([summary]), jamais sept nombres.
 */
@Composable
public fun MeeshySpark(
    points: List<Double>,
    summary: String,
    modifier: Modifier = Modifier,
    tint: Color = MeeshyPalette.Indigo500,
) {
    Canvas(
        modifier
            .width(MeeshyFiguresRecipe.SPARK_WIDTH.dp)
            .height(MeeshyFiguresRecipe.SPARK_HEIGHT.dp)
            .semantics { contentDescription = summary },
    ) {
        val laid = MeeshyFiguresRecipe.sparkPoints(points, size.width.toDouble(), size.height.toDouble())
        if (laid.size < 2) return@Canvas
        val line = Path().apply {
            laid.forEachIndexed { index, point ->
                val offset = Offset(point.x.toFloat(), point.y.toFloat())
                if (index == 0) moveTo(offset.x, offset.y) else lineTo(offset.x, offset.y)
            }
        }
        val area = Path().apply {
            addPath(line)
            lineTo(size.width, size.height)
            lineTo(0f, size.height)
            close()
        }
        drawPath(area, Brush.verticalGradient(listOf(tint.copy(alpha = MeeshyFiguresRecipe.SPARK_AREA_OPACITY.toFloat()), Color.Transparent)))
        drawPath(line, tint, style = Stroke(MeeshyFiguresRecipe.SPARK_STROKE.dp.toPx(), cap = StrokeCap.Round, join = StrokeJoin.Round))
        val end = laid.last()
        drawCircle(tint, MeeshyFiguresRecipe.SPARK_DOT.dp.toPx() / 2f, Offset(end.x.toFloat(), end.y.toFloat()))
    }
}
