package me.meeshy.app.game.ceremony

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.Canvas
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.unit.Dp
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
import me.meeshy.sdk.model.game.MeeshCoinFace
import me.meeshy.sdk.model.game.MeeshEdition
import me.meeshy.sdk.model.game.ceremony.MintCeremonyFrame
import me.meeshy.sdk.model.game.ceremony.MintCeremonyHitter
import me.meeshy.sdk.model.game.ceremony.MintCeremonyPose
import me.meeshy.sdk.model.game.ceremony.MintCeremonyStage as Stage
import me.meeshy.ui.component.game.MeeFigure
import me.meeshy.ui.component.game.MeeshCoin

/** Mee ou Meo par leurs figures : au repos, à la fête (une pose par édition), ou Mee qui encourage au refus. */
@Composable
internal fun Actor(bird: MintCeremonyHitter, edition: MeeshEdition, pose: MintCeremonyFrame.Actor, fit: MintCeremonyFit, side: Dp) {
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
internal fun CoinLayers(frame: MintCeremonyFrame, look: MeeshEdition, number: Int, year: Int, fit: MintCeremonyFit, palette: MintCeremonyPalette) {
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

internal fun DrawScope.stage(fit: MintCeremonyFit, block: DrawScope.() -> Unit) =
    translate(fit.offX, fit.offY) { scale(fit.k, fit.k, pivot = Offset.Zero) { block() } }

/** La forge : les rayons de l'or et du prisme, la lumière, l'enclume. Les particules ont leur Canvas. */
internal fun DrawScope.drawForge(
    fit: MintCeremonyFit,
    frame: MintCeremonyFrame,
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
}

/** L'Ombre du refus voile le cercle ; les étincelles reviennent à ta lumière par le chemin pris. */
internal fun DrawScope.drawShadow(fit: MintCeremonyFit, frame: MintCeremonyFrame, palette: MintCeremonyPalette) = stage(fit) {
    if (frame.shadow.opacity > 0) {
        val center = Offset(Stage.CIRCLE.x.toFloat(), Stage.CIRCLE.y.toFloat())
        val radius = (115 * frame.shadow.scale).toFloat()
        drawCircle(Brush.radialGradient(0f to palette.ombre[0], 0.42f to palette.ombre[1], 0.72f to palette.ombre[2], center = center, radius = radius * 1.41f),
            radius = radius, center = center, alpha = frame.shadow.opacity.toFloat())
    }
}


/** Les rayons : des pans d'une roue autour de la pièce, qui s'effacent vers le bord. */
internal fun DrawScope.drawRays(frame: MintCeremonyFrame, palette: MintCeremonyPalette, prism: Boolean) {
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
internal fun DrawScope.drawTools(fit: MintCeremonyFit, frame: MintCeremonyFrame, palette: MintCeremonyPalette) = stage(fit) {
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
internal fun DrawScope.drawHammer(h: MintCeremonyFrame.Hammer, palette: MintCeremonyPalette) {
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
internal fun DrawScope.drawFlash(fit: MintCeremonyFit, frame: MintCeremonyFrame, palette: MintCeremonyPalette) = stage(fit) {
    if (frame.flash > 0) {
        val center = Offset(180f, 448f)
        drawRect(Brush.radialGradient(0f to palette.flash[0], 0.355f to palette.flash[1], 1f to palette.flash[2], center = center, radius = 270f),
            Offset(-180f, 448f - 640f), Size(720f, 1280f), alpha = frame.flash.toFloat().coerceIn(0f, 1f))
    }
}
