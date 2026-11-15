package me.meeshy.app.game.progression

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Rect
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.PathEffect
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.StrokeJoin
import androidx.compose.ui.graphics.drawscope.DrawScope
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.drawscope.rotate
import androidx.compose.ui.graphics.drawscope.scale
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.drawText
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.rememberTextMeasurer
import me.meeshy.sdk.model.game.FlameFormKey
import me.meeshy.ui.component.game.GameMaterial
import me.meeshy.ui.component.game.GamePalette
import me.meeshy.ui.component.game.GameSvgPath
import me.meeshy.ui.component.game.SignatureStyle
import me.meeshy.ui.component.game.drawGameSignature
import me.meeshy.ui.theme.MeeshyPalette

// Les emblèmes DESSINÉS des concepts de Progression — miroirs de `ConceptMarkView`, `FlameView`, `ChestView`,
// `TrophyView` et `AtlasStampView` (iOS), dans leurs boîtes et leurs matières. Décoratifs : l'hôte dit le concept.

/** La marque d'un concept sans objet : le jeton des Points, le panneau des Élans. */
@Composable
internal fun ConceptMarkEmblem(kind: ConceptMarkKind, modifier: Modifier = Modifier) {
    val design = remember(kind) { ConceptMarkDesign.of(kind) }
    Canvas(modifier.aspectRatio(1f)) {
        boxed(ConceptMarkDesign.BOX) { drawConceptMark(design) }
    }
}

private fun DrawScope.drawConceptMark(design: ConceptMarkDesign) {
    val ink = when (design.paint) {
        ConceptMarkDesign.Paint.Indigo -> Color.White
        ConceptMarkDesign.Paint.Flame -> GameMaterial.FLAME.ink
    }
    val edge = MeeshyPalette.Indigo950.copy(alpha = EDGE_ALPHA)
    when (val body = design.body) {
        is ConceptMarkDesign.Body.Circle -> {
            val frame = Rect(body.center, body.radius)
            drawCircle(paint(design.paint, frame), body.radius, body.center)
            drawCircle(edge, body.radius, body.center, style = Stroke(1f))
        }
        is ConceptMarkDesign.Body.Panel -> {
            val frame = Rect(Offset(body.left, body.top), Size(body.side, body.side))
            drawRoundRect(paint(design.paint, frame), frame.topLeft, frame.size, CornerRadius(body.radius))
            drawRoundRect(edge, frame.topLeft, frame.size, CornerRadius(body.radius), style = Stroke(1f))
        }
    }
    drawGameSignature(design.signature.center, design.signature.size, ink, SignatureStyle.Engraved, design.signature.strokeWidth)
    when (val accent = design.accent) {
        is ConceptMarkDesign.Accent.Spark -> {
            val spark = polyline(accent.points, closed = true)
            drawPath(spark, GameMaterial.GOLD.brush(spark.getBounds()))
            drawPath(spark, Color.White, style = Stroke(SPARK_EDGE, join = StrokeJoin.Round))
        }
        is ConceptMarkDesign.Accent.Chevron -> drawPath(
            polyline(accent.points, closed = false),
            ink,
            style = Stroke(accent.lineWidth, cap = StrokeCap.Round, join = StrokeJoin.Round),
        )
    }
}

private fun paint(paint: ConceptMarkDesign.Paint, frame: Rect): Brush = when (paint) {
    ConceptMarkDesign.Paint.Indigo -> GamePalette.diagonal(GamePalette.indigo, frame)
    ConceptMarkDesign.Paint.Flame -> GameMaterial.FLAME.brush(frame)
}

/** La Flamme, à sa forme : réduite autour de son pied, la Signature blanche au cœur après la braise, le halo d'or de l'Astre. */
@Composable
internal fun FlameEmblem(form: FlameFormKey, modifier: Modifier = Modifier) {
    val body = remember { GameSvgPath.make(FlameEmblemGeometry.BODY) }
    Canvas(modifier.aspectRatio(1f)) {
        boxed(ConceptMarkDesign.BOX) {
            FlameEmblemGeometry.haloRadius(form)?.let { radius ->
                drawCircle(
                    GamePalette.gold,
                    radius,
                    FlameEmblemGeometry.HALO_CENTER,
                    style = Stroke(HALO_WIDTH, pathEffect = PathEffect.dashPathEffect(floatArrayOf(3f, 4f))),
                )
            }
            val s = FlameEmblemGeometry.scale(form)
            scale(s, s, pivot = FlameEmblemGeometry.FOOT) {
                drawPath(body, GameMaterial.FLAME.brush(body.getBounds()))
                if (FlameEmblemGeometry.carriesSignature(form)) {
                    drawGameSignature(FlameEmblemGeometry.SIGNATURE_CENTER, FlameEmblemGeometry.SIGNATURE_SIDE, Color.White, SignatureStyle.Flat, 120f)
                }
            }
        }
    }
}

/** Le coffre du jour : indigo, bandeau d'or, serrure à la Signature gravée ; ouvert, le couvercle levé et trois étincelles. */
@Composable
internal fun ChestEmblem(open: Boolean, modifier: Modifier = Modifier) {
    val closedLid = remember { GameSvgPath.make(ChestEmblemGeometry.CLOSED_LID) }
    val openLid = remember { GameSvgPath.make(ChestEmblemGeometry.OPEN_LID) }
    val sparkles = remember { GameSvgPath.make(ChestEmblemGeometry.SPARKLES) }
    Canvas(modifier.aspectRatio(ChestEmblemGeometry.ASPECT)) {
        boxed(ChestEmblemGeometry.WIDTH) {
            if (open) {
                drawPath(openLid, GamePalette.violet.copy(alpha = OPEN_LID_ALPHA))
                drawPath(sparkles, GamePalette.gold, style = Stroke(2f, cap = StrokeCap.Round))
            } else {
                drawPath(closedLid, GamePalette.violet)
            }
            val body = Rect(Offset(10f, 30f), Size(70f, 36f))
            drawRoundRect(GamePalette.diagonal(GamePalette.indigo, body), body.topLeft, body.size, CornerRadius(6f))
            val band = Rect(Offset(10f, 30f), Size(70f, 6f))
            drawRect(GameMaterial.GOLD.brush(band), band.topLeft, band.size)
            val lock = Rect(Offset(35f, 36f), Size(20f, 16f))
            drawRoundRect(GameMaterial.GOLD.brush(lock), lock.topLeft, lock.size, CornerRadius(3f))
            drawGameSignature(Offset(45f, 44f), 15f, GameMaterial.GOLD.ink, SignatureStyle.Engraved, 120f)
        }
    }
}

/** Une coupe dans sa matière, la Signature frappée sur la panse, la plaque sombre au pied (sans inscription ici). */
@Composable
internal fun CupEmblem(material: GameMaterial, modifier: Modifier = Modifier) {
    val handles = remember { GameSvgPath.make(CupEmblemGeometry.HANDLES) }
    val bowl = remember { GameSvgPath.make(CupEmblemGeometry.BOWL) }
    Canvas(modifier.aspectRatio(CupEmblemGeometry.ASPECT)) {
        boxed(CupEmblemGeometry.WIDTH) {
            val metal = material.brush(bowl.getBounds())
            drawPath(handles, material.brush(handles.getBounds()), style = Stroke(5f))
            drawPath(bowl, metal)
            drawPath(bowl, GamePalette.ink.copy(alpha = CUP_EDGE_ALPHA), style = Stroke(1f))
            drawRect(metal, Offset(54f, 72f), Size(12f, 16f))
            drawRoundRect(metal, Offset(36f, 88f), Size(48f, 9f), CornerRadius(2f))
            drawRoundRect(GamePalette.ink.copy(alpha = PLATE_ALPHA), Offset(30f, 97f), Size(60f, 17f), CornerRadius(3f))
            drawGameSignature(Offset(60f, 38f), 42f, material.ink, SignatureStyle.Struck, 100f)
        }
    }
}

/** Le tampon d'Atlas : un cachet incliné, deux cercles, le code de la langue et la Signature ; à découvrir, en pointillé. */
@Composable
internal fun AtlasStampEmblem(code: String, stamped: Boolean, tint: Color, muted: Color, modifier: Modifier = Modifier) {
    val measurer = rememberTextMeasurer()
    val label = AtlasStampGeometry.label(code)
    val ink = if (stamped) tint else muted
    Canvas(modifier.aspectRatio(1f)) {
        boxed(ConceptMarkDesign.BOX) {
            rotate(AtlasStampGeometry.TILT, pivot = Offset(36f, 36f)) {
                val dashes = if (stamped) null else PathEffect.dashPathEffect(floatArrayOf(4f, 4f))
                drawCircle(ink, 29f, Offset(36f, 36f), style = Stroke(2.5f, pathEffect = dashes))
                drawCircle(ink, 23f, Offset(36f, 36f), style = Stroke(1f))
                val text = measurer.measure(label, TextStyle(fontSize = STAMP_FONT.toSp(), fontWeight = FontWeight.Black, color = ink))
                drawText(text, topLeft = Offset(36f - text.size.width / 2f, 38f - text.size.height / 2f))
                drawGameSignature(Offset(36f, 48f), 14f, ink, SignatureStyle.Flat, 120f)
            }
        }
    }
}

/** Pose un dessin écrit dans une boîte de [boxWidth] unités sur la largeur offerte. */
private inline fun DrawScope.boxed(boxWidth: Float, crossinline draw: DrawScope.() -> Unit) {
    val k = size.width / boxWidth
    scale(k, k, pivot = Offset.Zero) { draw() }
}

private fun polyline(points: List<Offset>, closed: Boolean): Path = Path().apply {
    points.firstOrNull()?.let { moveTo(it.x, it.y) }
    points.drop(1).forEach { lineTo(it.x, it.y) }
    if (closed) close()
}

private const val EDGE_ALPHA = 0.25f
private const val SPARK_EDGE = 1.5f
private const val HALO_WIDTH = 1.5f
private const val OPEN_LID_ALPHA = 0.85f
private const val CUP_EDGE_ALPHA = 0.3f
private const val PLATE_ALPHA = 0.88f
private const val STAMP_FONT = 15f
