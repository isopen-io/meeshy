package me.meeshy.ui.component.game

import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.drawWithContent
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.BlendMode
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.CompositingStrategy
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.graphics.drawscope.rotate
import androidx.compose.ui.graphics.drawscope.Stroke
import me.meeshy.sdk.model.game.GameEffectsLaw
import kotlin.math.max

/*
 * Les trois effets du jeu, en modificateurs. Sur Android ils n'exigent AUCUN shader : ils sont les replis en
 * dégradé des shaders iOS (`SheenBand`, `StrikeRing`, `IridescentSheet`). Un modificateur reçoit un
 * `progress` ou un `tilt` que l'hôte anime ; il n'a ni horloge ni capteur. Hors de son temps
 * (`progress` <= 0 ou >= 1), il ne pose AUCUN effet et ne coûte aucune passe de dessin.
 */

/** Les effets ne peignent que sur les pixels du contenu : un calque hors écran, sinon `SrcAtop` déborde. */
private fun Modifier.offscreen(): Modifier = graphicsLayer { compositingStrategy = CompositingStrategy.Offscreen }

/** Un reflet spéculaire qui traverse la vue. [progress] va de 0 à 1 (l'hôte l'anime). */
public fun Modifier.gameSpecularSheen(progress: Double, intensity: Double = 0.9): Modifier =
    if (!GameEffectsLaw.isActive(progress) || intensity <= 0) {
        this
    } else {
        offscreen().drawWithContent {
            drawContent()
            val alpha = GameEffectsLaw.sheenAlpha(progress, intensity).toFloat()
            val bandWidth = size.width * 0.4f
            val left = size.width * GameEffectsLaw.sheenOffsetFraction(progress).toFloat()
            rotate(degrees = 20f, pivot = center) {
                drawRect(
                    brush = Brush.horizontalGradient(
                        colors = listOf(Color.White.copy(alpha = 0f), Color.White.copy(alpha = alpha), Color.White.copy(alpha = 0f)),
                        startX = left,
                        endX = left + bandWidth,
                    ),
                    topLeft = Offset(left, -size.height * 0.3f),
                    size = androidx.compose.ui.geometry.Size(bandWidth, size.height * 1.6f),
                    blendMode = BlendMode.SrcAtop,
                )
            }
        }
    }

/**
 * Une onde de frappe qui part de [center] (point unitaire de la vue). [progress] va de 0 à 1 : un anneau
 * qui s'élargit et s'éteint depuis le point d'impact.
 */
public fun Modifier.gameStrikeWave(
    progress: Double,
    center: Offset = Offset(0.5f, 0.5f),
    amplitude: Float = 5f,
): Modifier =
    if (!GameEffectsLaw.isActive(progress) || amplitude <= 0f) {
        this
    } else {
        drawWithContent {
            drawContent()
            val diameter = max(size.width, size.height) * GameEffectsLaw.ringDiameterFraction(progress).toFloat()
            drawCircle(
                color = Color.White.copy(alpha = GameEffectsLaw.ringAlpha(progress).toFloat()),
                radius = diameter / 2,
                center = Offset(center.x * size.width, center.y * size.height),
                style = Stroke(width = 3f),
            )
        }
    }

/**
 * L'irisation du prisme selon l'inclinaison [tilt] (en tours, 0 au repos). Le prisme en dégradé qui glisse
 * avec l'inclinaison, en lumière douce. Sans intensité, aucun effet.
 */
public fun Modifier.gamePrismIridescence(tilt: Double, intensity: Double = 0.6): Modifier =
    if (intensity <= 0) {
        this
    } else {
        offscreen().drawWithContent {
            drawContent()
            val shift = tilt.toFloat() * size.width
            drawRect(
                brush = Brush.linearGradient(
                    *GamePalette.prismStops.toTypedArray(),
                    start = Offset(-0.5f * size.width + shift, 0f),
                    end = Offset(0.5f * size.width + shift, size.height),
                ),
                alpha = GameEffectsLaw.iridescenceAlpha(intensity).toFloat(),
                blendMode = BlendMode.SrcAtop,
            )
        }
    }
