package me.meeshy.ui.appearance

import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import me.meeshy.sdk.model.appearance.AppearanceDesignPalette
import me.meeshy.sdk.model.appearance.AppearancePaintRole
import me.meeshy.sdk.model.appearance.PaintRoleResolver
import me.meeshy.sdk.model.appearance.SvgPathData
import me.meeshy.sdk.model.appearance.SvgSegment

/** La couleur d'un rôle pour une palette de schéma et l'accent effectif du lecteur (miroir de `AppearancePaint.color`). */
internal fun appearanceColor(role: AppearancePaintRole, palette: AppearanceDesignPalette, accentHex: String): Color =
    appearanceHexColor(PaintRoleResolver.hex(role, palette, accentHex))

/** `#RGB`, `#RRGGBB` ou `#RRGGBBAA` (dièse facultatif) ; tout le reste se lit noir. */
internal fun appearanceHexColor(hex: String): Color {
    val digits = hex.removePrefix("#").let { if (it.length == 3) it.flatMap { c -> listOf(c, c) }.joinToString("") else it }
    val rgb = digits.take(RGB_DIGITS).toLongOrNull(RADIX_HEX) ?: 0L
    val alpha = if (digits.length == RGBA_DIGITS) digits.substring(RGB_DIGITS).toIntOrNull(RADIX_HEX) ?: OPAQUE else OPAQUE
    return Color(((alpha.toLong() shl ALPHA_SHIFT) or rgb).toInt())
}

private const val RGB_DIGITS = 6
private const val RGBA_DIGITS = 8
private const val RADIX_HEX = 16
private const val OPAQUE = 255
private const val ALPHA_SHIFT = 24

/** Les segments absolus du lecteur pur, en `Path` Compose. */
internal fun List<SvgSegment>.toComposePath(): Path = Path().also { path ->
    forEach { segment ->
        when (segment) {
            is SvgSegment.MoveTo -> path.moveTo(segment.x.toFloat(), segment.y.toFloat())
            is SvgSegment.LineTo -> path.lineTo(segment.x.toFloat(), segment.y.toFloat())
            is SvgSegment.CubicTo -> path.cubicTo(
                segment.x1.toFloat(), segment.y1.toFloat(),
                segment.x2.toFloat(), segment.y2.toFloat(),
                segment.x.toFloat(), segment.y.toFloat(),
            )
            is SvgSegment.QuadTo -> path.quadraticBezierTo(
                segment.cx.toFloat(), segment.cy.toFloat(), segment.x.toFloat(), segment.y.toFloat(),
            )
            SvgSegment.Close -> path.close()
        }
    }
}

/** Un chemin SVG `d` illisible ou vide rend un chemin vide : rien ne se peint, rien ne plante. */
internal fun svgComposePath(d: String): Path = SvgPathData.parse(d).toComposePath()
