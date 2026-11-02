package me.meeshy.ui.sticker

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.CutCornerShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.rotate
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Shape
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.TextUnit
import androidx.compose.ui.unit.dp
import kotlin.math.PI
import kotlin.math.cos
import kotlin.math.sin
import me.meeshy.sdk.model.sticker.StickerSlotFiller
import me.meeshy.sdk.model.sticker.StickerTemplateCatalog
import me.meeshy.ui.R
import me.meeshy.ui.theme.MeeshyPalette

/**
 * Le dessin d'un sticker à GABARIT (`templateId` + `slots`), le même pour la feuille, le canevas du compositeur et le
 * lecteur — miroir borné de `StickerTemplateRenderer` (iOS) sur les familles Texte (10) et Heure (4). [body] est la
 * taille du corps de texte : tout le reste en dérive, l'hôte met à l'échelle par sa propre transformation. Un cadre à
 * mots sans mots montre l'exemple (« Coucou ! ») ; une décoration d'heure montre l'heure FIGÉE que l'auteur a posée.
 */
@Composable
public fun StickerTemplateArtwork(templateId: String, slots: Map<String, String>, body: Dp, modifier: Modifier = Modifier) {
    val font = with(LocalDensity.current) { body.toSp() }
    when (templateId) {
        "time.digital" -> DigitalClock(slots, font, body, modifier)
        "time.analog" -> AnalogClock(slots, body, modifier)
        "time.ribbon" -> TextFrame(slots[StickerSlotFiller.TIME].orEmpty(), TextFrameStyle.RIBBON, font, body, modifier)
        "time.calendarDay" -> CalendarPage(slots[StickerSlotFiller.DATE].orEmpty(), font, body, modifier)
        else -> {
            val words = slots[StickerSlotFiller.TEXT]?.takeIf { it.isNotBlank() } ?: stringResource(R.string.sticker_text_example)
            TextFrame(words, TextFrameStyle.of(templateId), font, body, modifier)
        }
    }
}

public object StickerTemplateArtwork {
    private val drawn: Set<String> = StickerTemplateCatalog.all.map { it.id }.toSet()

    /** Seuls les gabarits du catalogue se dessinent ; un autre (météo, recherche iOS) retombe sur son emoji. */
    public fun knows(templateId: String): Boolean = templateId in drawn
}

private enum class TextFrameStyle(val shape: Shape, val fill: Color, val ink: Color, val border: Color?, val tilt: Float) {
    BUBBLE(RoundedCornerShape(50), Color.White, MeeshyPalette.PlateauNoir, null, 0f),
    THOUGHT(RoundedCornerShape(50), MeeshyPalette.SurfaceLightMist, MeeshyPalette.Indigo900, null, 0f),
    NOTE(RoundedCornerShape(2.dp), MeeshyPalette.TileSaffron, MeeshyPalette.PlateauNoir, null, -3f),
    RIBBON(CutCornerShape(topStartPercent = 0, topEndPercent = 50, bottomEndPercent = 50, bottomStartPercent = 0), MeeshyPalette.TileCoral, Color.White, null, 0f),
    BADGE(RoundedCornerShape(50), MeeshyPalette.Indigo500, Color.White, null, 0f),
    NEON(RoundedCornerShape(12.dp), MeeshyPalette.PlateauNoir, MeeshyPalette.TileCyan, MeeshyPalette.TileCyan, 0f),
    TAG(CutCornerShape(topStartPercent = 50, bottomStartPercent = 50, topEndPercent = 0, bottomEndPercent = 0), MeeshyPalette.TileEmerald, Color.White, null, 0f),
    SIGN(RoundedCornerShape(6.dp), MeeshyPalette.Amber500, MeeshyPalette.PlateauNoir, MeeshyPalette.PlateauNoir, 0f),
    TAPE(RoundedCornerShape(1.dp), MeeshyPalette.SurfaceLightRaised, MeeshyPalette.PlateauNoir, null, 2f),
    STAMP(RoundedCornerShape(6.dp), Color.Transparent, MeeshyPalette.Error, MeeshyPalette.Error, -8f),
    ;

    companion object {
        fun of(templateId: String): TextFrameStyle = when (templateId) {
            "text.thoughtBubble" -> THOUGHT
            "text.stickyNote" -> NOTE
            "text.ribbon" -> RIBBON
            "text.badge" -> BADGE
            "text.neon" -> NEON
            "text.tag" -> TAG
            "text.signboard" -> SIGN
            "text.tape" -> TAPE
            "text.stamp" -> STAMP
            else -> BUBBLE
        }
    }
}

@Composable
private fun TextFrame(words: String, style: TextFrameStyle, font: TextUnit, body: Dp, modifier: Modifier) {
    val frame = modifier
        .rotate(style.tilt)
        .widthIn(max = body * 12)
        .shadow(if (style.fill == Color.Transparent) 0.dp else body / 8, style.shape)
        .clip(style.shape)
        .background(style.fill)
        .let { base -> style.border?.let { base.border(BorderStroke(body / 10, it), style.shape) } ?: base }
        .padding(horizontal = body * 0.8f, vertical = body * 0.45f)
    Box(frame, contentAlignment = Alignment.Center) {
        Text(
            text = if (style == TextFrameStyle.STAMP) words.uppercase() else words,
            color = style.ink,
            fontSize = font,
            fontWeight = FontWeight.Bold,
            textAlign = TextAlign.Center,
            maxLines = 3,
            overflow = TextOverflow.Ellipsis,
        )
    }
}

@Composable
private fun DigitalClock(slots: Map<String, String>, font: TextUnit, body: Dp, modifier: Modifier) {
    Box(
        modifier
            .clip(RoundedCornerShape(body / 2))
            .background(MeeshyPalette.PlateauNoir)
            .border(BorderStroke(body / 12, MeeshyPalette.Indigo400), RoundedCornerShape(body / 2))
            .padding(horizontal = body * 0.7f, vertical = body * 0.35f),
    ) {
        Text(
            text = slots[StickerSlotFiller.TIME].orEmpty(),
            color = MeeshyPalette.TileCyan,
            fontSize = font * 1.4f,
            fontFamily = FontFamily.Monospace,
            fontWeight = FontWeight.Bold,
            maxLines = 1,
        )
    }
}

@Composable
private fun AnalogClock(slots: Map<String, String>, body: Dp, modifier: Modifier) {
    val hour = slots[StickerSlotFiller.HOUR]?.toIntOrNull() ?: 0
    val minute = slots[StickerSlotFiller.MINUTE]?.toIntOrNull() ?: 0
    val label = stringResource(
        R.string.sticker_template_time_a11y,
        stringResource(R.string.sticker_template_time_analog),
        slots[StickerSlotFiller.TIME].orEmpty(),
    )
    Box(
        modifier
            .size(body * 3.2f)
            .shadow(body / 8, CircleShape)
            .clip(CircleShape)
            .background(Color.White)
            .semantics { contentDescription = label },
    ) {
        Canvas(Modifier.size(body * 3.2f)) {
            val radius = size.minDimension / 2
            val stroke = radius / 14
            drawCircle(MeeshyPalette.PlateauNoir, radius - stroke / 2, style = Stroke(stroke))
            (0 until 12).forEach { tick ->
                val angle = tick * PI / 6
                val outer = Offset(center.x + (radius * 0.86f) * sin(angle).toFloat(), center.y - (radius * 0.86f) * cos(angle).toFloat())
                val inner = Offset(center.x + (radius * 0.74f) * sin(angle).toFloat(), center.y - (radius * 0.74f) * cos(angle).toFloat())
                drawLine(MeeshyPalette.Neutral500, inner, outer, stroke / 2, StrokeCap.Round)
            }
            hand(((hour % 12) + minute / 60.0) * PI / 6, radius * 0.5f, stroke * 1.4f, MeeshyPalette.PlateauNoir)
            hand(minute * PI / 30, radius * 0.75f, stroke, MeeshyPalette.Indigo500)
            drawCircle(MeeshyPalette.Indigo500, stroke)
        }
    }
}

private fun androidx.compose.ui.graphics.drawscope.DrawScope.hand(angle: Double, length: Float, width: Float, color: Color) {
    val tip = Offset(center.x + length * sin(angle).toFloat(), center.y - length * cos(angle).toFloat())
    drawLine(color, center, tip, width, StrokeCap.Round)
}

@Composable
private fun CalendarPage(date: String, font: TextUnit, body: Dp, modifier: Modifier) {
    Column(
        modifier
            .widthIn(min = body * 4, max = body * 10)
            .shadow(body / 8, RoundedCornerShape(body / 3))
            .clip(RoundedCornerShape(body / 3))
            .background(Color.White),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Box(Modifier.fillMaxWidth().background(MeeshyPalette.Error).padding(vertical = body / 4))
        Text(
            text = date,
            color = MeeshyPalette.PlateauNoir,
            fontSize = font,
            fontWeight = FontWeight.Bold,
            textAlign = TextAlign.Center,
            maxLines = 2,
            modifier = Modifier.padding(horizontal = body / 2, vertical = body / 2),
        )
    }
}
