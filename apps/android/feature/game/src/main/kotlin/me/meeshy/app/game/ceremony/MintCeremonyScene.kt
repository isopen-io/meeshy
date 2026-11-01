package me.meeshy.app.game.ceremony

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.BlendMode
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.drawscope.DrawScope
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.drawscope.rotate
import androidx.compose.ui.graphics.drawscope.scale
import androidx.compose.ui.graphics.drawscope.translate
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.layout.layout
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.Constraints
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.unit.TextUnit
import kotlin.math.roundToInt
import me.meeshy.sdk.model.game.MeeshCoinFace
import me.meeshy.sdk.model.game.MeeshEdition
import me.meeshy.sdk.model.game.ceremony.MintCeremonyFrame
import me.meeshy.sdk.model.game.ceremony.MintCeremonyHitter
import me.meeshy.sdk.model.game.ceremony.MintCeremonyPaint
import me.meeshy.sdk.model.game.ceremony.MintCeremonyPose
import me.meeshy.sdk.model.game.ceremony.MintCeremonyStage as Stage
import me.meeshy.ui.component.game.MeeFigure
import me.meeshy.ui.component.game.MeeshCoin

/** La scène de 360 × 640 portée dans l'écran sans déformation (miroir de `MintCeremonyFit`). */
internal class MintCeremonyFit(val width: Float, val height: Float) {
    val k: Float = (minOf(width / Stage.WIDTH.toFloat(), height / Stage.HEIGHT.toFloat())).takeIf { it > 0 } ?: 1f
    val offX: Float = (width - Stage.WIDTH.toFloat() * k) / 2
    val offY: Float = (height - Stage.HEIGHT.toFloat() * k) / 2
}

/** Ce que la scène écrit, résolu par l'hôte dans la langue de l'interface. */
internal data class MintCeremonyWords(
    val light: String,
    val tchak: String,
    val tchakFinal: String,
    val ancestors: String,
    val ancestorsLine: String,
    val say: String,
    val glory: String,
)

/** Pose une boîte de la scène — coin haut-gauche ([x], [y]), taille [w] × [h] en unités de la scène — dans l'écran. */
private fun Modifier.stageBox(fit: MintCeremonyFit, x: Double, y: Double, w: Double, h: Double): Modifier = layout { measurable, _ ->
    val width = (w * fit.k).roundToInt().coerceAtLeast(0)
    val height = (h * fit.k).roundToInt().coerceAtLeast(0)
    val placeable = measurable.measure(Constraints.fixed(width, height))
    layout(width, height) { placeable.place(IntOffset((fit.offX + x * fit.k).roundToInt(), (fit.offY + y * fit.k).roundToInt())) }
}

/**
 * LA SCÈNE DE LA FRAPPE (miroir de `MintCeremonyScene` + `MintCeremonyLayers` iOS) — elle ne fait qu'appliquer, à chaque
 * image, l'image que la loi rend ([MintCeremonyFrame]) : les particules et la forge dans UN `Canvas`, Mee, Meo, la pièce
 * et les phrases en position, rotation et opacité. La pièce se dessine dans son édition d'AFFICHAGE ([look]).
 */
@Composable
internal fun MintCeremonyScene(
    frame: MintCeremonyFrame,
    paint: MintCeremonyPaint,
    edition: MeeshEdition,
    look: MeeshEdition,
    number: Int,
    year: Int,
    reduced: Boolean,
    words: MintCeremonyWords,
    modifier: Modifier = Modifier,
) {
    val palette = MintCeremonyPalette(edition)
    BoxWithConstraints(modifier.fillMaxSize()) {
        val density = LocalDensity.current
        val fit = with(density) { MintCeremonyFit(maxWidth.toPx(), maxHeight.toPx()) }
        fun sp(size: Double): TextUnit = with(density) { (size * fit.k).toFloat().toSp() }
        fun dp(size: Double): Dp = with(density) { (size * fit.k).toFloat().toDp() }
        Canvas(Modifier.fillMaxSize().graphicsLayer { alpha = frame.backdrop.toFloat() }) {
            drawRect(Brush.radialGradient(0f to palette.bg[0], 0.62f to palette.bg[1], 1f to palette.bg[2],
                center = Offset(size.width / 2, size.height * 0.45f), radius = maxOf(size.width, size.height) * 0.62f))
        }
        Box(
            Modifier.fillMaxSize().graphicsLayer {
                translationX = (frame.shake.x * fit.k).toFloat()
                translationY = (frame.shake.y * fit.k).toFloat()
            },
        ) {
            Box(Modifier.fillMaxSize().graphicsLayer { alpha = frame.backdrop.toFloat() }) {
                Canvas(Modifier.fillMaxSize()) { drawForge(fit, frame, paint, palette, edition, reduced) }
                StageText(words.ancestors, fit, 20.0, 150.0, 320.0, 22.0, sp(15.0), palette.sign, FontWeight.SemiBold, alpha = frame.sign)
                StageText(words.ancestorsLine, fit, 20.0, 172.0, 320.0, 18.0, sp(11.5), palette.signSub, FontWeight.Medium, alpha = frame.sign)
                if (!reduced) StageText(words.light, fit, 100.0, 128.0, 160.0, 16.0, sp(11.0), palette.orbInk, FontWeight.SemiBold)
                Actor(MintCeremonyHitter.Mee, edition, frame.mee, fit, dp(Stage.BIRD))
                Actor(MintCeremonyHitter.Meo, edition, frame.meo, fit, dp(Stage.BIRD))
                Canvas(Modifier.fillMaxSize()) { drawTools(fit, frame, palette) }
                Box(
                    Modifier.stageBox(fit, 60.0, 318.0, 240.0, 36.0).graphicsLayer {
                        alpha = frame.tchak.opacity.toFloat()
                        scaleX = frame.tchak.scale.toFloat()
                        scaleY = frame.tchak.scale.toFloat()
                    },
                ) {
                    TchakText(words.tchak, sp(28.0), palette, visible = !frame.tchak.isFinal)
                    TchakText(words.tchakFinal, sp(28.0), palette, visible = frame.tchak.isFinal)
                }
                Canvas(Modifier.fillMaxSize()) { drawFlash(fit, frame, palette) }
                StageText(words.say, fit, 16.0, 600.0, 328.0, 40.0, sp(14.0), palette.say, FontWeight.Normal, alpha = frame.say, italic = true)
            }
            CoinLayers(frame, look, number, year, fit, palette)
            StageText(words.glory, fit, Stage.DEFAULT_TARGET.x - 80, Stage.DEFAULT_TARGET.y - 24 - 40 * frame.glory.rise, 160.0, 18.0,
                sp(13.0), palette.gloryInk, FontWeight.ExtraBold, alpha = frame.glory.opacity)
        }
    }
}

@Composable
private fun StageText(
    text: String,
    fit: MintCeremonyFit,
    x: Double,
    y: Double,
    w: Double,
    h: Double,
    size: TextUnit,
    color: Color,
    weight: FontWeight,
    alpha: Double = 1.0,
    italic: Boolean = false,
) {
    Text(
        text,
        Modifier.stageBox(fit, x, y, w, h).graphicsLayer { this.alpha = alpha.toFloat() },
        style = TextStyle(color = color, fontSize = size, fontWeight = weight, fontStyle = if (italic) FontStyle.Italic else FontStyle.Normal,
            textAlign = TextAlign.Center),
    )
}

@Composable
private fun TchakText(text: String, size: TextUnit, palette: MintCeremonyPalette, visible: Boolean) {
    Text(
        text,
        Modifier.fillMaxSize().graphicsLayer { alpha = if (visible) 1f else 0f },
        style = TextStyle(color = palette.tchak, fontSize = size, fontWeight = FontWeight.Black, textAlign = TextAlign.Center),
    )
}

/** Mee ou Meo par leurs figures : au repos, à la fête (une pose par édition), ou Mee qui encourage au refus. */
@Composable
private fun Actor(bird: MintCeremonyHitter, edition: MeeshEdition, pose: MintCeremonyFrame.Actor, fit: MintCeremonyFit, side: Dp) {
    val films = MintCeremonyFilms.of(bird, edition)
    Box(
        Modifier.stageBox(fit, pose.x, pose.y, Stage.BIRD, Stage.BIRD).graphicsLayer {
            rotationZ = pose.rotate.toFloat()
            scaleX = pose.scale.toFloat()
            scaleY = pose.scale.toFloat()
        },
    ) {
        films.forEach { (film, shown) ->
            MeeFigure(
                film,
                side,
                Modifier.graphicsLayer { alpha = if (shown == pose.pose) 1f else 0f },
                animates = false,
                mirrored = bird == MintCeremonyHitter.Meo,
            )
        }
    }
}

/** Les films de Mee et Meo à la forge (iOS `MintCeremonyActor`). */
internal object MintCeremonyFilms {
    fun of(bird: MintCeremonyHitter, edition: MeeshEdition): List<Pair<String, MintCeremonyPose>> {
        val party = when (edition) {
            MeeshEdition.Silver -> "mee-bravo" to "meo-trophee"
            MeeshEdition.Gold -> "mee-jackpot" to "meo-roi"
            MeeshEdition.Prism -> "mee-wow" to "meo-feu-artifice"
        }
        return if (bird == MintCeremonyHitter.Mee) {
            listOf("mee-sourire" to MintCeremonyPose.Rest, party.first to MintCeremonyPose.Party, "mee-courage" to MintCeremonyPose.Courage)
        } else {
            listOf("meo-salut" to MintCeremonyPose.Rest, party.second to MintCeremonyPose.Party)
        }
    }
}

/** La pièce : la lueur, le flan qui devient l'avers frappé, puis le revers numéroté, chacun visible quand il regarde l'écran. */
@Composable
private fun CoinLayers(frame: MintCeremonyFrame, look: MeeshEdition, number: Int, year: Int, fit: MintCeremonyFit, palette: MintCeremonyPalette) {
    Canvas(Modifier.fillMaxSize()) {
        val glow = frame.glow
        val center = Offset((fit.offX + glow.x * fit.k).toFloat(), (fit.offY + glow.y * fit.k).toFloat())
        val radius = (120 * fit.k * glow.scale).toFloat()
        if (glow.opacity > 0 && radius > 0) {
            drawCircle(
                Brush.radialGradient(0f to palette.glow[0], 0.35f to palette.glow[1], 0.68f to palette.glow[2], center = center, radius = radius * 1.41f),
                radius = radius,
                center = center,
                alpha = glow.opacity.toFloat().coerceIn(0f, 1f),
            )
        }
    }
    val coin = frame.coin
    val turned = ((coin.rotateY % 360) + 360) % 360
    val showsReverse = turned > 90 && turned < 270
    Box(
        Modifier.stageBox(fit, coin.x - 75, coin.y - 75, 150.0, 150.0).graphicsLayer {
            alpha = coin.opacity.toFloat()
            scaleX = coin.scale.toFloat()
            scaleY = (coin.scale * coin.squash).toFloat()
        },
    ) {
        val face = Modifier.fillMaxSize()
        Box(face.graphicsLayer { rotationY = coin.rotateY.toFloat(); cameraDistance = 12 * density; alpha = if (showsReverse) HIDDEN else 1f }) {
            MeeshCoin(face.graphicsLayer { alpha = maxOf(HIDDEN, (1 - coin.engraved).toFloat()) }, face = MeeshCoinFace.Blank, edition = look)
            MeeshCoin(face.graphicsLayer { alpha = maxOf(HIDDEN, coin.engraved.toFloat()) }, face = MeeshCoinFace.Obverse, edition = look)
        }
        MeeshCoin(
            face.graphicsLayer { rotationY = (coin.rotateY + 180).toFloat(); cameraDistance = 12 * density; alpha = if (showsReverse) 1f else HIDDEN },
            face = MeeshCoinFace.Reverse(number, year),
            edition = look,
        )
    }
}

/** Une face cachée n'est jamais tout à fait transparente : dessinée dès l'ouverture, elle ne coûte rien quand elle paraît. */
private const val HIDDEN = 0.001f

private fun DrawScope.stage(fit: MintCeremonyFit, block: DrawScope.() -> Unit) =
    translate(fit.offX, fit.offY) { scale(fit.k, fit.k, pivot = Offset.Zero) { block() } }

/** La forge : les rayons de l'or et du prisme, la lumière, l'enclume, les particules, l'Ombre du refus. */
private fun DrawScope.drawForge(
    fit: MintCeremonyFit,
    frame: MintCeremonyFrame,
    paint: MintCeremonyPaint,
    palette: MintCeremonyPalette,
    edition: MeeshEdition,
    reduced: Boolean,
) = stage(fit) {
    drawRays(frame, palette, edition == MeeshEdition.Prism)
    if (reduced) return@stage
    val orbCenter = Offset(180f, 96f)
    scale(frame.orb.toFloat(), pivot = orbCenter) {
        drawCircle(Brush.radialGradient(0f to palette.orb[0], 0.36f to palette.orb[1], 0.7f to palette.orb[2], center = orbCenter, radius = 42.4f),
            radius = 30f, center = orbCenter)
    }
    drawRoundRect(Brush.verticalGradient(palette.anvilTop, startY = 543f, endY = 553f), Offset(104f, 543f), Size(152f, 10f), CornerRadius(4f))
    val anvil = Path().apply {
        moveTo(112f, 550f)
        lineTo(248f, 550f)
        lineTo(112f + 136f * 0.82f, 596f)
        lineTo(112f + 136f * 0.18f, 596f)
        close()
    }
    drawPath(anvil, Brush.verticalGradient(palette.anvil, startY = 550f, endY = 596f))
    paint.batches.forEach { batch ->
        val color = palette.color(batch.ink)
        val alpha = batch.opacity.toFloat()
        val blend = if (batch.additive) BlendMode.Plus else BlendMode.SrcOver
        batch.rects.forEach { r -> drawRect(color, Offset(r.x.toFloat(), r.y.toFloat()), Size(r.width.toFloat(), r.height.toFloat()), alpha, blendMode = blend) }
        batch.circles.forEach { c ->
            drawCircle(color, (c.width / 2).toFloat(), Offset((c.x + c.width / 2).toFloat(), (c.y + c.height / 2).toFloat()), alpha, blendMode = blend)
        }
    }
    if (frame.shadow.opacity > 0) {
        val center = Offset(Stage.CIRCLE.x.toFloat(), Stage.CIRCLE.y.toFloat())
        val radius = (115 * frame.shadow.scale).toFloat()
        drawCircle(Brush.radialGradient(0f to palette.ombre[0], 0.42f to palette.ombre[1], 0.72f to palette.ombre[2], center = center, radius = radius * 1.41f),
            radius = radius, center = center, alpha = frame.shadow.opacity.toFloat())
    }
}

/** Les rayons : des pans d'une roue autour de la pièce, qui s'effacent vers le bord. */
private fun DrawScope.drawRays(frame: MintCeremonyFrame, palette: MintCeremonyPalette, prism: Boolean) {
    val rays = frame.rays
    if (rays.opacity <= 0) return
    val center = Offset(frame.coin.x.toFloat(), frame.coin.y.toFloat())
    val radius = 165f * rays.scale.toFloat()
    fun wedge(from: Float, sweep: Float, color: Color) = drawArc(
        Brush.radialGradient(0f to color, 0.26f to color, 0.7f to color.copy(alpha = 0f), center = center, radius = radius * 1.41f),
        startAngle = from - 90f + rays.rotate.toFloat(), sweepAngle = sweep, useCenter = true,
        topLeft = Offset(center.x - radius, center.y - radius), size = Size(radius * 2, radius * 2), alpha = rays.opacity.toFloat(),
    )
    if (prism) {
        val tints = listOf(palette.iris[0], palette.iris[2], palette.iris[3], palette.iris[4], palette.iris[5])
        (0 until 8).forEach { turn -> tints.forEachIndexed { index, tint -> wedge(turn * 45f + index * 7f, 7f, tint) } }
    } else {
        (0 until 18).forEach { turn -> wedge(turn * 20f, 8f, palette.ray) }
    }
}

/** Le coin, les marteaux, et l'ONDE du coup qui part de l'enclume. */
private fun DrawScope.drawTools(fit: MintCeremonyFit, frame: MintCeremonyFrame, palette: MintCeremonyPalette) = stage(fit) {
    val die = frame.die
    if (die.opacity > 0) {
        scale(1f, die.squash.toFloat(), pivot = Offset((die.x + 13).toFloat(), (die.y + 50).toFloat())) {
            drawRoundRect(
                Brush.horizontalGradient(0f to palette.die[0], 0.45f to palette.die[1], 1f to palette.die[2], startX = die.x.toFloat(), endX = (die.x + 26).toFloat()),
                Offset(die.x.toFloat(), die.y.toFloat()), Size(26f, 50f), CornerRadius(4f), alpha = die.opacity.toFloat(),
            )
        }
    }
    drawHammer(frame.hammerMeo, palette)
    drawHammer(frame.hammerMee, palette)
    val ring = frame.ring
    if (ring.opacity > 0) {
        val radius = (30 * ring.scale).toFloat()
        drawCircle(palette.ring, radius - 1.5f, Offset(180f, (Stage.ANVIL_CENTER.y - 40).toFloat()), ring.opacity.toFloat().coerceIn(0f, 1f), Stroke(3f))
    }
}

/** Le marteau : un manche de bois, une tête d'acier qui déborde en haut ; il tourne autour du bas du manche. */
private fun DrawScope.drawHammer(h: MintCeremonyFrame.Hammer, palette: MintCeremonyPalette) {
    if (h.opacity <= 0) return
    val x = h.x.toFloat()
    val y = h.y.toFloat()
    rotate(h.angle.toFloat(), pivot = Offset(x + 4f, y + 100f)) {
        drawRoundRect(Brush.horizontalGradient(listOf(palette.wood[0], palette.wood[1], palette.wood[0]), startX = x, endX = x + 8f),
            Offset(x, y), Size(8f, 100f), CornerRadius(3f), alpha = h.opacity.toFloat())
        drawRoundRect(Brush.verticalGradient(palette.steel, startY = y - 14f, endY = y + 8f),
            Offset(x - 17f, y - 14f), Size(42f, 22f), CornerRadius(5f), alpha = h.opacity.toFloat())
    }
}

/** L'éclair du coup, par-dessus tout. */
private fun DrawScope.drawFlash(fit: MintCeremonyFit, frame: MintCeremonyFrame, palette: MintCeremonyPalette) = stage(fit) {
    if (frame.flash > 0) {
        val center = Offset(180f, 448f)
        drawRect(Brush.radialGradient(0f to palette.flash[0], 0.355f to palette.flash[1], 1f to palette.flash[2], center = center, radius = 270f),
            Offset(-180f, 448f - 640f), Size(720f, 1280f), alpha = frame.flash.toFloat().coerceIn(0f, 1f))
    }
}
