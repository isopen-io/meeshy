package me.meeshy.ui.component.game

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.DrawScope
import me.meeshy.sdk.model.game.GameSignatureGeometry
import me.meeshy.sdk.model.game.GameSignatureGeometry.Tint
import me.meeshy.sdk.model.game.GameSignatureStyle
import kotlin.math.min

/** Les trois manières de poser la Signature selon la matière qui la porte. */
public enum class SignatureStyle(internal val geometry: GameSignatureStyle) {
    /** À plat sur les fonds de couleur (anneaux, cœur de la Flamme, tampons). */
    Flat(GameSignatureStyle.FLAT),

    /** Frappée sur le métal (pièces, coupes) : relief, ombre en bas à droite, éclat en haut à gauche. */
    Struck(GameSignatureStyle.STRUCK),

    /** Gravée sur les blasons, badges et gemmes : creux, plus sombre que la matière. */
    Engraved(GameSignatureStyle.ENGRAVED),
}

/** Dessine la Signature : les proportions sont fixes, jamais déformées. */
public fun DrawScope.drawGameSignature(
    center: Offset,
    side: Float,
    color: Color,
    style: SignatureStyle = SignatureStyle.Flat,
    strokeWidth: Float = GameSignatureGeometry.DEFAULT_STROKE_WIDTH,
) {
    val scale = side / GameSignatureGeometry.VIEWPORT
    val origin = Offset(center.x - side / 2, center.y - side / 2)
    val lineWidth = GameSignatureGeometry.lineWidth(strokeWidth, side)
    GameSignatureGeometry.layers(style.geometry).forEach { layer ->
        val tint = when (layer.tint) {
            Tint.SHADOW -> GamePalette.signatureShadow
            Tint.WHITE -> Color.White
            Tint.INK -> color
        }
        val dx = layer.dx * side
        val dy = layer.dy * side
        GameSignatureGeometry.dashes.forEach { dash ->
            drawLine(
                color = tint.copy(alpha = layer.uniformOpacity ?: dash.opacity),
                start = Offset(origin.x + dx + dash.x0 * scale, origin.y + dy + dash.y * scale),
                end = Offset(origin.x + dx + dash.x1 * scale, origin.y + dy + dash.y * scale),
                strokeWidth = lineWidth,
                cap = StrokeCap.Round,
            )
        }
    }
}

/**
 * La Signature, seule, dans un carré qui prend toute la place offerte.
 *
 * [contentDescription] nul : décorative, masquée ; l'hôte qui sait ce que la Signature veut dire ici la libelle.
 */
@Composable
public fun SignatureMark(
    color: Color,
    modifier: Modifier = Modifier,
    style: SignatureStyle = SignatureStyle.Flat,
    strokeWidth: Float = GameSignatureGeometry.DEFAULT_STROKE_WIDTH,
    contentDescription: String? = null,
) {
    Canvas(modifier.aspectRatio(1f).gameAccessibility(contentDescription)) {
        drawGameSignature(
            center = Offset(size.width / 2, size.height / 2),
            side = min(size.width, size.height),
            color = color,
            style = style,
            strokeWidth = strokeWidth,
        )
    }
}
