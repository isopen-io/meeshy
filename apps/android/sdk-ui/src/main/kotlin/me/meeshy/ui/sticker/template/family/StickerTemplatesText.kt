package me.meeshy.ui.sticker.template.family

import android.graphics.Canvas
import android.graphics.Paint
import android.graphics.Path
import android.graphics.RectF
import android.util.SizeF
import kotlin.math.ceil
import kotlin.math.max
import me.meeshy.sdk.model.sticker.StickerSlotFiller
import me.meeshy.sdk.model.sticker.StickerTemplateFamily
import me.meeshy.ui.R
import me.meeshy.ui.sticker.template.StickerTemplateDrawer
import me.meeshy.ui.sticker.template.StickerTemplateDrawing
import me.meeshy.ui.sticker.template.StickerTemplateFamilyDrawing
import me.meeshy.ui.sticker.template.StickerTemplateMetrics
import me.meeshy.ui.sticker.template.StickerTemplatePalette
import me.meeshy.ui.sticker.template.StickerTemplateShapes

/**
 * Les dix cadres à MOTS — miroir de `StickerTemplates+Text` (iOS). Le texte est celui de l'AUTEUR, figé dans
 * l'emplacement `text` ; vide, l'hôte y glisse l'exemple localisé (la feuille montre ce que le cadre fera des mots). Chaque
 * cadre PLIE le texte à neuf corps de large. La CASSE entre dans la mesure : un cadre en capitales mesure les capitales,
 * sinon la boîte du tap et l'image rendue divergent.
 */
internal object TextStickerTemplates : StickerTemplateFamilyDrawing {
    override val family: StickerTemplateFamily = StickerTemplateFamily.TEXT

    /** Ce qu'un cadre sans mots dessine quand l'hôte n'a pas posé d'exemple. */
    const val PLACEHOLDER: String = "…"

    fun proseText(slots: Map<String, String>): String =
        slots[StickerSlotFiller.TEXT]?.trim()?.takeIf { it.isNotEmpty() } ?: PLACEHOLDER

    private class Layout(val text: String, val paint: Paint, val textSize: SizeF)

    private class Frame(
        val id: String,
        val nameRes: Int,
        val size: (SizeF, StickerTemplateMetrics) -> SizeF,
        /** Dessine le cadre dans le rectangle et rend la zone où écrire le texte. */
        val frame: (Canvas, RectF, StickerTemplateMetrics) -> RectF,
        val textColor: Int,
        val textScale: Float,
        val weight: Int,
        val uppercase: Boolean = false,
        val glow: Int? = null,
    )

    private fun layout(frame: Frame, slots: Map<String, String>, metrics: StickerTemplateMetrics): Layout {
        val raw = proseText(slots)
        val text = if (frame.uppercase) raw.uppercase() else raw
        val paint = StickerTemplateDrawing.font(metrics.fontSize * frame.textScale, frame.weight, frame.textColor)
        return Layout(text, paint, StickerTemplateDrawing.measureWrapped(text, paint, metrics.fontSize * StickerTemplateDrawing.WRAP_BODIES))
    }

    private fun padded(text: SizeF, m: StickerTemplateMetrics, extraWidth: Float = 0f, extraHeight: Float = 0f) =
        SizeF(ceil(text.width + m.horizontalPadding * 2 + extraWidth), ceil(text.height + m.verticalPadding * 2 + extraHeight))

    private fun drawer(frame: Frame) = StickerTemplateDrawer(
        id = frame.id,
        name = { it.getString(frame.nameRes) },
        measure = { slots, metrics -> frame.size(layout(frame, slots, metrics).textSize, metrics) },
        draw = { slots, metrics, density ->
            val l = layout(frame, slots, metrics)
            val size = frame.size(l.textSize, metrics)
            StickerTemplateDrawing.rasterize(size, density) { canvas ->
                val zone = frame.frame(canvas, RectF(0f, 0f, size.width, size.height), metrics)
                val box = RectF(zone.centerX() - l.textSize.width / 2f, zone.centerY() - l.textSize.height / 2f, zone.centerX() + l.textSize.width / 2f, zone.centerY() + l.textSize.height / 2f)
                frame.glow?.let { l.paint.setShadowLayer(metrics.fontSize * 0.45f, 0f, 0f, it) }
                StickerTemplateDrawing.drawWrapped(canvas, l.text, l.paint, box)
            }
        },
    )

    private fun card(canvas: Canvas, rect: RectF, radius: Float, top: Int, bottom: Int, outline: Int, width: Float): RectF {
        StickerTemplateDrawing.fillWithOutline(canvas, StickerTemplateShapes.roundedRect(rect, radius), top, bottom, rect, outline, width)
        return rect
    }

    private fun tapeEdge(rect: RectF, teeth: Int, left: Boolean): Path {
        val step = rect.height() / teeth
        val x = if (left) rect.left else rect.right
        val tooth = rect.width() * 0.03f * (if (left) 1 else -1)
        return Path().apply {
            moveTo(x, rect.top)
            repeat(teeth) { index ->
                val y = rect.top + step * index
                lineTo(x + tooth, y + step / 2f)
                lineTo(x, y + step)
            }
        }
    }

    private fun inset(rect: RectF, d: Float) = RectF(rect.left + d, rect.top + d, rect.right - d, rect.bottom - d)

    private val frames: List<Frame> = listOf(
        Frame(
            "text.speechBubble", R.string.sticker_template_text_speech_bubble,
            size = { t, m -> padded(t, m, extraHeight = m.fontSize * 0.55f) },
            frame = { canvas, r, m ->
                val tail = m.fontSize * 0.55f
                StickerTemplateDrawing.fillWithOutline(canvas, StickerTemplateShapes.speechBubble(inset(r, 1f), tail), StickerTemplatePalette.surface, StickerTemplatePalette.accent, max(1f, m.fontSize * 0.06f))
                RectF(r.left, r.top, r.right, r.bottom - tail)
            },
            textColor = StickerTemplatePalette.label, textScale = 0.78f, weight = StickerTemplateDrawing.BOLD,
        ),
        Frame(
            "text.thoughtBubble", R.string.sticker_template_text_thought_bubble,
            size = { t, m -> padded(t, m, extraWidth = m.fontSize * 0.6f, extraHeight = m.fontSize * 1.1f) },
            frame = { canvas, r, m ->
                val tail = m.fontSize * 0.7f
                StickerTemplateDrawing.fillWithOutline(canvas, StickerTemplateShapes.thoughtBubble(inset(r, 1f), tail), StickerTemplatePalette.surface, StickerTemplatePalette.lilac, max(1f, m.fontSize * 0.06f))
                RectF(r.left, r.top + m.fontSize * 0.25f, r.right, r.bottom - tail)
            },
            textColor = StickerTemplatePalette.label, textScale = 0.74f, weight = StickerTemplateDrawing.SEMIBOLD,
        ),
        Frame(
            "text.stickyNote", R.string.sticker_template_text_sticky_note,
            size = { t, m ->
                val side = ceil(max(t.width, t.height) + m.horizontalPadding * 2)
                SizeF(side, side)
            },
            frame = { canvas, r, m ->
                StickerTemplateDrawing.fillPath(canvas, Path().apply { addRect(r, Path.Direction.CW) }, StickerTemplatePalette.warmBulb)
                val fold = m.fontSize * 0.55f
                val corner = Path().apply {
                    moveTo(r.right - fold, r.bottom)
                    lineTo(r.right, r.bottom - fold)
                    lineTo(r.right - fold, r.bottom - fold)
                    close()
                }
                StickerTemplateDrawing.fillPath(canvas, corner, StickerTemplatePalette.withAlpha(StickerTemplatePalette.surface, 0.85f))
                r
            },
            textColor = StickerTemplatePalette.ink, textScale = 0.74f, weight = StickerTemplateDrawing.SEMIBOLD,
        ),
        Frame(
            "text.ribbon", R.string.sticker_template_text_ribbon,
            size = { t, m -> padded(t, m, extraWidth = m.fontSize * 1.0f) },
            frame = { canvas, r, m ->
                val q = m.fontSize * 0.5f
                val h = r.height()
                val l = r.width()
                val ribbon = Path().apply {
                    moveTo(0f, 0f); lineTo(l, 0f); lineTo(l - q, h / 2f); lineTo(l, h); lineTo(0f, h); lineTo(q, h / 2f); close()
                }
                StickerTemplateDrawing.fillGradient(canvas, ribbon, StickerTemplatePalette.accent, StickerTemplatePalette.loveCool, r)
                r
            },
            textColor = StickerTemplatePalette.surface, textScale = 0.78f, weight = StickerTemplateDrawing.HEAVY,
        ),
        Frame(
            "text.badge", R.string.sticker_template_text_badge,
            size = { t, m -> padded(t, m, extraWidth = m.fontSize * 0.4f) },
            frame = { canvas, r, m ->
                card(canvas, inset(r, 1f), r.height() / 2f, StickerTemplatePalette.accent, StickerTemplatePalette.night, StickerTemplatePalette.surface, max(1f, m.fontSize * 0.05f))
            },
            textColor = StickerTemplatePalette.surface, textScale = 0.78f, weight = StickerTemplateDrawing.HEAVY,
        ),
        Frame(
            "text.neon", R.string.sticker_template_text_neon,
            size = { t, m -> padded(t, m, extraWidth = m.fontSize * 0.6f, extraHeight = m.fontSize * 0.3f) },
            frame = { canvas, r, m ->
                StickerTemplateDrawing.fillPath(canvas, StickerTemplateShapes.roundedRect(r, m.fontSize * 0.4f), StickerTemplatePalette.night)
                r
            },
            textColor = StickerTemplatePalette.surface, textScale = 0.82f, weight = StickerTemplateDrawing.HEAVY,
            uppercase = true, glow = StickerTemplatePalette.loveWarm,
        ),
        Frame(
            "text.tag", R.string.sticker_template_text_tag,
            size = { t, m -> padded(t, m, extraWidth = m.fontSize * 1.2f) },
            frame = { canvas, r, m ->
                val corner = m.fontSize * 0.7f
                val tag = Path().apply {
                    moveTo(r.left + corner, r.top); lineTo(r.right, r.top); lineTo(r.right, r.bottom)
                    lineTo(r.left + corner, r.bottom); lineTo(r.left, r.centerY()); close()
                }
                StickerTemplateDrawing.fillGradient(canvas, tag, StickerTemplatePalette.lilac, StickerTemplatePalette.accent, r)
                val hole = m.fontSize * 0.22f
                val cx = r.left + corner * 0.55f
                StickerTemplateDrawing.fillPath(canvas, Path().apply { addOval(RectF(cx - hole / 2f, r.centerY() - hole / 2f, cx + hole / 2f, r.centerY() + hole / 2f), Path.Direction.CW) }, StickerTemplatePalette.surface)
                RectF(r.left + corner, r.top, r.right, r.bottom)
            },
            textColor = StickerTemplatePalette.surface, textScale = 0.76f, weight = StickerTemplateDrawing.BOLD,
        ),
        Frame(
            "text.signboard", R.string.sticker_template_text_signboard,
            size = { t, m -> padded(t, m, extraWidth = m.fontSize * 0.4f, extraHeight = m.fontSize * 0.9f) },
            frame = { canvas, r, m ->
                val post = m.fontSize * 0.9f
                val board = RectF(r.left, r.top, r.right, r.bottom - post)
                StickerTemplateDrawing.fillPath(canvas, Path().apply { addRect(RectF(r.centerX() - m.fontSize * 0.12f, board.bottom - 1f, r.centerX() + m.fontSize * 0.12f, board.bottom - 1f + post), Path.Direction.CW) }, StickerTemplatePalette.warmBulb)
                card(canvas, board, m.fontSize * 0.2f, StickerTemplatePalette.warmBulb, StickerTemplatePalette.pin, StickerTemplatePalette.surface, max(1f, m.fontSize * 0.05f))
                val nail = m.fontSize * 0.16f
                listOf(board.left + nail * 1.4f, board.right - nail * 2.4f).forEach { x ->
                    StickerTemplateDrawing.fillPath(canvas, Path().apply { addOval(RectF(x, board.top + nail * 1.2f, x + nail, board.top + nail * 2.2f), Path.Direction.CW) }, StickerTemplatePalette.ink)
                }
                board
            },
            textColor = StickerTemplatePalette.surface, textScale = 0.78f, weight = StickerTemplateDrawing.HEAVY,
        ),
        Frame(
            "text.tape", R.string.sticker_template_text_tape,
            size = { t, m -> padded(t, m, extraWidth = m.fontSize * 0.8f) },
            frame = { canvas, r, _ ->
                val tape = StickerTemplatePalette.withAlpha(StickerTemplatePalette.surface, 0.78f)
                val margin = r.width() * 0.03f
                StickerTemplateDrawing.fillPath(canvas, Path().apply { addRect(RectF(r.left + margin, r.top, r.right - margin, r.bottom), Path.Direction.CW) }, tape)
                listOf(tapeEdge(r, 7, true) to r.left + margin, tapeEdge(r, 7, false) to r.right - margin).forEach { (edge, x) ->
                    edge.lineTo(x, r.bottom)
                    edge.lineTo(x, r.top)
                    edge.close()
                    StickerTemplateDrawing.fillPath(canvas, edge, tape)
                }
                r
            },
            textColor = StickerTemplatePalette.ink, textScale = 0.72f, weight = StickerTemplateDrawing.MEDIUM,
        ),
        Frame(
            "text.stamp", R.string.sticker_template_text_stamp,
            size = { t, m -> padded(t, m, extraWidth = m.fontSize * 0.6f, extraHeight = m.fontSize * 0.3f) },
            frame = { canvas, r, m ->
                val edge = max(1.5f, m.fontSize * 0.09f)
                val stroke = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = StickerTemplatePalette.pin; style = Paint.Style.STROKE }
                stroke.strokeWidth = edge
                canvas.drawRoundRect(inset(r, edge), m.fontSize * 0.3f, m.fontSize * 0.3f, stroke)
                stroke.strokeWidth = edge * 0.6f
                canvas.drawRoundRect(inset(r, edge * 3.2f), m.fontSize * 0.22f, m.fontSize * 0.22f, stroke)
                r
            },
            textColor = StickerTemplatePalette.pin, textScale = 0.80f, weight = StickerTemplateDrawing.HEAVY, uppercase = true,
        ),
    )

    override val drawers: List<StickerTemplateDrawer> = frames.map { drawer(it) }
}
