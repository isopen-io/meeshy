package me.meeshy.ui.component.game

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.graphicsLayer
import me.meeshy.sdk.model.game.GameHapticPattern
import me.meeshy.sdk.model.game.GameSignatureGeometry
import me.meeshy.sdk.model.game.GameTimeline
import me.meeshy.sdk.model.game.GloryRank
import me.meeshy.sdk.model.game.MythicSeatRef

/**
 * Ce que la chorégraphie de la montée de rang montre à l'instant [seconds] (pur : prouvé sans écran). `null` : au
 * repos, le blason tel quel. Sous mouvement réduit : un fondu de l'écu posé.
 */
internal data class RankBlasonFrame(
    val tenants: Boolean,
    val rise: Double,
    val strokes: List<Double>,
    val sheen: Double,
    val opacity: Double,
) {
    val offsetUnits: Double get() = (1 - rise) * RISE_OFFSET
    val scale: Double get() = 0.88 + 0.12 * rise

    companion object {
        private const val RISE_OFFSET = 18.0

        private val RESTING = RankBlasonFrame(true, 1.0, listOf(0.0, 0.0, 0.0), 0.0, 1.0)

        fun at(seconds: Double?, reduceMotion: Boolean): RankBlasonFrame {
            if (seconds == null) return RESTING
            if (reduceMotion) return RESTING.copy(opacity = minOf(1.0, seconds / GameTimeline.REDUCED_DURATION))
            val phase = GameTimeline.rank(seconds)
            return RankBlasonFrame(
                tenants = phase.tenants > 0.5,
                rise = phase.rise,
                strokes = phase.strokes,
                sheen = phase.sheen,
                opacity = 0.25 + 0.75 * phase.rise,
            )
        }

        /** L'instant où le trait [index] est à son éclat maximal (milieu de sa fenêtre de 0,3 s). */
        fun strokePeak(index: Int): Double = GameTimeline.RANK_STROKE_TIMES[index] + 0.15
    }
}

private const val SIGNATURE_CENTER_X = 100f / 200f
private const val SIGNATURE_CENTER_Y = 81f / 184f
private const val SIGNATURE_SIDE = 60f / 200f
private const val SIGNATURE_STROKE = 96f
private const val GLOW_ALPHA = 0.9f

/**
 * L'écu qui monte (miroir de `RankBlasonStage`) : « nouveau rang ou division : l'écu monte, la Signature se grave
 * trait par trait, les tenants se posent » en 1,6 s, avec trois tapes haptiques, une par trait. Au repos (jamais
 * joué, ou fini) c'est [RankBlason] tel quel ; [play] s'incrémente pour (re)jouer.
 */
@Composable
public fun RankBlasonStage(
    rank: GloryRank,
    division5: Int?,
    play: Int,
    modifier: Modifier = Modifier,
    level: Int? = null,
    mythic: MythicSeatRef? = null,
    title: String? = null,
    accessibilityLabel: String? = null,
) {
    val haptics = rememberGameHaptics()
    ChoreographyClock(play = play, duration = GameTimeline.RANK_DURATION, modifier = modifier) { seconds, reduceMotion ->
        LaunchedEffect(play, reduceMotion) {
            if (play > 0 && !reduceMotion) haptics.play(GameHapticPattern.rank)
        }
        val frame = RankBlasonFrame.at(seconds, reduceMotion)
        val moving = seconds != null && !reduceMotion
        val blason: @Composable () -> Unit = {
            RankBlason(
                rank = rank, division5 = division5, level = level, mythic = mythic, title = title,
                figures = if (frame.tenants) GameFigures.standard else null,
                accessibilityLabel = accessibilityLabel,
            )
        }
        BoxWithConstraints(
            Modifier
                .aspectRatio(200f / 184f)
                .graphicsLayer {
                    translationY = frame.offsetUnits.toFloat() * size.width / 200f
                    scaleX = frame.scale.toFloat()
                    scaleY = scaleX
                    alpha = frame.opacity.toFloat()
                }
                .let { if (moving) it.gameSpecularSheen(frame.sheen) else it }
                .let { if (rank == GloryRank.Mythe) it.gamePrismTilt() else it },
        ) {
            blason()
            if (moving) SignatureStrokes(frame.strokes)
        }
    }
}

/** Les trois traits de la Signature, un éclat chacun, posés sur la gravure. */
@Composable
private fun SignatureStrokes(glows: List<Double>) {
    Canvas(Modifier.fillMaxSize()) {
        val side = size.width * SIGNATURE_SIDE
        val center = Offset(size.width * SIGNATURE_CENTER_X, size.height * SIGNATURE_CENTER_Y)
        val origin = Offset(center.x - side / 2, center.y - side / 2)
        val scale = side / GameSignatureGeometry.VIEWPORT
        val width = GameSignatureGeometry.lineWidth(SIGNATURE_STROKE, side)
        GameSignatureGeometry.dashes.forEachIndexed { index, dash ->
            val glow = glows.getOrElse(index) { 0.0 }.toFloat()
            if (glow <= 0f) return@forEachIndexed
            drawLine(
                Color.White.copy(alpha = GLOW_ALPHA * glow),
                Offset(origin.x + dash.x0 * scale, origin.y + dash.y * scale),
                Offset(origin.x + dash.x1 * scale, origin.y + dash.y * scale),
                strokeWidth = width, cap = StrokeCap.Round,
            )
        }
    }
}
