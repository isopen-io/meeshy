package me.meeshy.app.game.photo

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.wrapContentSize
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Rect
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.BlendMode
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.CompositingStrategy
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.StrokeJoin
import androidx.compose.ui.graphics.TransformOrigin
import androidx.compose.ui.graphics.drawscope.DrawScope
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.LocalLayoutDirection
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.rememberTextMeasurer
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.Density
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.unit.LayoutDirection
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.material3.Text
import me.meeshy.sdk.model.game.photo.AuthorPlate
import me.meeshy.sdk.model.game.photo.GamePhotoAuthorPlateMotion
import me.meeshy.sdk.model.game.photo.PlateFinish
import me.meeshy.sdk.model.game.photo.PlateMetal
import me.meeshy.ui.component.MeeshyAvatar
import me.meeshy.ui.component.game.GameMaterial
import me.meeshy.ui.theme.MeeshyPalette
import kotlin.math.roundToInt

internal const val AUTHOR_PLATE_TAG = "game.photo.author.plate"

/**
 * LA PLAQUE D'AUTEUR (#10816, iOS `GameAuthorPlateView`) — le cartouche à bouts entaillés qui grave le pseudo de
 * l'auteur, dans une boîte de 360 × 100 mise à l'échelle de [width]. À gauche le médaillon (photo de profil dans la
 * carte posée, monogramme dans l'image exportée), à droite la formule en petites capitales et le `@pseudo` dans le
 * fini de l'étape. Le texte est FIGÉ dans le cadre : ni la taille de texte du système ni son échelle de police ne le
 * font sortir de la plaque. Décoratif : l'hôte dit la plaque en toutes lettres ([caption] sert au dessin seulement).
 */
@Composable
internal fun GameAuthorPlateView(
    plate: AuthorPlate,
    caption: String,
    width: Dp,
    modifier: Modifier = Modifier,
    showsAvatar: Boolean = false,
) {
    val scale = width.value / GamePhotoAuthorPlateMotion.WIDTH
    val height = (GamePhotoAuthorPlateMotion.HEIGHT * scale).dp
    val device = LocalDensity.current.density
    val fixed = Density(1f, 1f)
    Box(modifier.size(width, height).testTag(AUTHOR_PLATE_TAG).clearAndSetSemantics {}) {
        CompositionLocalProvider(LocalDensity provides fixed, LocalLayoutDirection provides LayoutDirection.Ltr) {
            Box(
                Modifier
                    .wrapContentSize(Alignment.TopStart, unbounded = true)
                    .graphicsLayer {
                        scaleX = scale * device
                        scaleY = scale * device
                        transformOrigin = TransformOrigin(0f, 0f)
                    }
                    .size(GamePhotoAuthorPlateMotion.WIDTH.dp, GamePhotoAuthorPlateMotion.HEIGHT.dp),
            ) { Drawing(plate, caption, showsAvatar) }
        }
    }
}

@Composable
private fun Drawing(plate: AuthorPlate, caption: String, showsAvatar: Boolean) {
    val paint = remember(plate.metal) { PlatePaint.of(plate.metal) }
    val box = Rect(0f, 0f, GamePhotoAuthorPlateMotion.WIDTH.toFloat(), GamePhotoAuthorPlateMotion.HEIGHT.toFloat())
    Canvas(Modifier.size(GamePhotoAuthorPlateMotion.WIDTH.dp, GamePhotoAuthorPlateMotion.HEIGHT.dp)) {
        drawPath(outline(BODY), paint.brush(box))
        drawPath(outline(INNER), paint.ink.copy(alpha = 0.35f), style = Stroke(1.2f))
        listOf(16f, 344f).forEach { drawCircle(paint.ink.copy(alpha = 0.45f), 2.6f, Offset(it, 50f)) }
    }
    Medallion(plate, paint, showsAvatar)
    FixedLine(caption.uppercase(), 10.5f, FontWeight.Bold, baseline = 37f, color = paint.ink.copy(alpha = 0.8f), spacing = 2.6f)
    Name(plate, paint)
}

@Composable
private fun Medallion(plate: AuthorPlate, paint: PlatePaint, showsAvatar: Boolean) {
    val diameter = 70f
    Box(Modifier.offset { IntOffset((58 - diameter / 2).roundToInt(), (50 - diameter / 2).roundToInt()) }.size(diameter.dp), Alignment.Center) {
        Canvas(Modifier.size(diameter.dp)) {
            drawCircle(paint.brush(Rect(0f, 0f, diameter, diameter)))
            drawCircle(paint.ink.copy(alpha = 0.4f), radius = diameter / 2 - 0.6f, style = Stroke(1.2f))
            drawCircle(EDGE, radius = 31f)
        }
        if (showsAvatar && plate.avatar != null) {
            Box(Modifier.size(62.dp).clip(CircleShape)) {
                MeeshyAvatar(name = plate.name, size = 62.dp, imageUrl = plate.avatar, containerColor = EDGE)
            }
        } else {
            Box(Modifier.size(56.dp, 32.dp), Alignment.Center) {
                FitText(plate.monogram, 25f, FontWeight.ExtraBold, Color.White, width = 56f)
            }
        }
    }
}

@Composable
private fun Name(plate: AuthorPlate, paint: PlatePaint) {
    when (plate.finish) {
        PlateFinish.Engrave -> {
            val edge = (if (paint.isDark) Color.Black else Color.White).copy(alpha = 0.55f)
            FixedLine(plate.name, 27f, FontWeight.ExtraBold, baseline = 71f, color = edge, lift = 1.2f)
            FixedLine(plate.name, 27f, FontWeight.ExtraBold, baseline = 71f, color = paint.ink)
        }
        PlateFinish.Emboss -> {
            Canvas(Modifier.size(GamePhotoAuthorPlateMotion.WIDTH.dp, GamePhotoAuthorPlateMotion.HEIGHT.dp)) {
                drawRoundRect(EDGE, Offset(104f, 47f), Size(220f, 34f), CornerRadius(7f))
                drawRoundRect(paint.ink.copy(alpha = 0.5f), Offset(104f, 47f), Size(220f, 34f), CornerRadius(7f), style = Stroke(1.2f))
            }
            FixedLine(plate.name, 24f, FontWeight.ExtraBold, baseline = 72f, color = Color.Black.copy(alpha = 0.7f), lift = 1.4f)
            FixedLine(plate.name, 24f, FontWeight.ExtraBold, baseline = 72f, brush = GameMaterial.GOLD)
        }
        PlateFinish.Scratch -> {
            FixedLine(plate.name, 27f, FontWeight.ExtraBold, baseline = 71f, brush = GameMaterial.GOLD)
            Canvas(
                Modifier
                    .size(GamePhotoAuthorPlateMotion.WIDTH.dp, GamePhotoAuthorPlateMotion.HEIGHT.dp)
                    .graphicsLayer { compositingStrategy = CompositingStrategy.Offscreen },
            ) { drawCoating() }
        }
    }
}

/** La couche d'argent du ticket, grattée en trois passes : ce qui en a été gratté ne cache plus le nom. */
private fun DrawScope.drawCoating() {
    val coat = Rect(112f, 40f, 112f + 204f, 40f + 40f)
    drawRoundRect(GameMaterial.SILVER.brush(coat), coat.topLeft, coat.size, CornerRadius(6f))
    val passes = Path().apply {
        SCRATCH_PASSES.forEachIndexed { index, (x, y) -> if (index == 0) moveTo(x, y) else lineTo(x, y) }
    }
    drawPath(passes, Color.Black, style = Stroke(11f, cap = StrokeCap.Butt, join = StrokeJoin.Round), blendMode = BlendMode.Clear)
}

/** Une ligne centrée sur [NAME_X], posée sur sa ligne de BASE comme `<text y=…>` : 1 dp = 1 px, 1 sp = 1 px. */
@Composable
private fun FixedLine(
    text: String,
    size: Float,
    weight: FontWeight,
    baseline: Float,
    color: Color = Color.Unspecified,
    brush: GameMaterial? = null,
    lift: Float = 0f,
    spacing: Float = 0f,
) {
    val height = size * LINE_HEIGHT
    val top = baseline - size * BASELINE_LIFT - height / 2 + lift
    Box(
        Modifier.offset { IntOffset((NAME_X - NAME_WIDTH / 2).roundToInt(), top.roundToInt()) }.size(NAME_WIDTH.dp, height.dp),
        Alignment.Center,
    ) { FitText(text, size, weight, color, NAME_WIDTH, brush, spacing) }
}

/** Un texte sur une ligne qui rétrécit (jusqu'à moitié) plutôt que de sortir de [width]. */
@Composable
private fun FitText(
    text: String,
    size: Float,
    weight: FontWeight,
    color: Color,
    width: Float,
    material: GameMaterial? = null,
    spacing: Float = 0f,
) {
    val measurer = rememberTextMeasurer()
    val base = TextStyle(fontSize = size.sp, fontWeight = weight, textAlign = TextAlign.Center, letterSpacing = spacing.sp)
    val natural = remember(text, base) { measurer.measure(text, base, softWrap = false).size.width.toFloat() }
    val shrink = if (natural > width) maxOf(MIN_SCALE, width / natural) else 1f
    val style = base.copy(fontSize = (size * shrink).sp, letterSpacing = (spacing * shrink).sp)
    val brush = material?.brush(Rect(0f, 0f, width, size * LINE_HEIGHT))
    if (brush != null) {
        Text(text, style = style.copy(brush = brush), maxLines = 1, softWrap = false)
    } else {
        Text(text, style = style.copy(color = color), maxLines = 1, softWrap = false)
    }
}

/** Le métal peint : les matières du jeu, et l'indigo de la plaque neutre. */
private class PlatePaint(val brush: (Rect) -> Brush, val ink: Color, val isDark: Boolean) {
    companion object {
        fun of(metal: PlateMetal): PlatePaint {
            val material = materialOf(metal)
            val isDark = metal == PlateMetal.Indigo || metal == PlateMetal.Obsidian
            if (material != null) return PlatePaint(material::brush, material.ink, isDark)
            val stops = listOf(0f to MeeshyPalette.Indigo400, 1f to MeeshyPalette.Indigo800)
            return PlatePaint(
                { box -> Brush.linearGradient(*stops.toTypedArray(), start = box.topLeft, end = box.bottomRight) },
                MeeshyPalette.Indigo50,
                isDark,
            )
        }

        private fun materialOf(metal: PlateMetal): GameMaterial? = when (metal) {
            PlateMetal.Copper -> GameMaterial.COPPER
            PlateMetal.Bronze -> GameMaterial.BRONZE
            PlateMetal.Silver -> GameMaterial.SILVER
            PlateMetal.Gold -> GameMaterial.GOLD
            PlateMetal.Platinum -> GameMaterial.PLATINUM
            PlateMetal.Obsidian -> GameMaterial.OBSIDIAN
            PlateMetal.Prism -> GameMaterial.PRISM
            PlateMetal.Indigo -> null
        }
    }
}

private fun outline(points: List<Pair<Float, Float>>): Path = Path().apply {
    points.forEachIndexed { index, (x, y) -> if (index == 0) moveTo(x, y) else lineTo(x, y) }
    close()
}

private val EDGE: Color = MeeshyPalette.Indigo950
private const val NAME_X = 214f
private const val NAME_WIDTH = 212f
private const val LINE_HEIGHT = 1.3f
private const val BASELINE_LIFT = 0.35f
private const val MIN_SCALE = 0.5f
private val BODY = listOf(22f to 8f, 338f to 8f, 352f to 50f, 338f to 92f, 22f to 92f, 8f to 50f)
private val INNER = listOf(27f to 15f, 333f to 15f, 344f to 50f, 333f to 85f, 27f to 85f, 16f to 50f)
private val SCRATCH_PASSES = listOf(118f to 46f, 310f to 50f, 120f to 58f, 312f to 62f, 118f to 70f, 310f to 76f)
