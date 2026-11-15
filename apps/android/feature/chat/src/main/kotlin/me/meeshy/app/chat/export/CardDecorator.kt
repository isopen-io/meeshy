package me.meeshy.app.chat.export

import kotlin.math.abs

/**
 * LE DÉCOR D'UNE MAQUETTE, POSÉ SUR LA CARTE (#18673) — miroir de `MessageCardDecorator` (iOS).
 * Après la mise en page commune, sans la refaire : le texte se centre, un cadre ou un panneau
 * entoure le contenu, un ornement le signe. Tout est peint SOUS le contenu.
 */
class CardDecorator(private val input: CardInput) {

    private val palette: CardPalette get() = input.template.palette.palette

    fun decorated(layout: CardLayout): CardLayout {
        val decor = input.decor
        if (decor.isNone) return layout
        val bounds = contentBounds(layout.regions) ?: return layout
        val centerX = textColumn(layout.regions)?.let { it.x + it.width / 2 } ?: (layout.width / 2)
        val quote = layout.regions.firstOrNull { it.part == CardPartId.QUOTE }
        val content = if (decor.alignment == CardDecor.Alignment.CENTER) layout.ops.mapNotNull { centered(it, centerX, quote) } else layout.ops
        val behind = tilted(panelOps(decor.frame, bounds, layout.width) + ornamentOps(decor, bounds, centerX), bounds, layout.width)
        return layout.copy(ops = frameOps(decor.frame, layout.width, layout.height) + behind + content)
    }

    /**
     * Une ligne qui part du DÉBUT de la colonne se centre ; ce qui est posé à la fin (l'heure, un
     * crédit) garde sa place. Le filet de la citation, qui n'a plus de bord où s'appuyer, se retire.
     */
    private fun centered(op: CardOp, x: Double, quote: CardRegion?): CardOp? = when {
        op is CardOp.Text && startsTheLine(op) -> op.copy(x = x, align = CardAlignment.CENTER)
        op is CardOp.Bar && isQuoteBar(op, quote) -> null
        op is CardOp.Group -> op.copy(ops = op.ops.mapNotNull { centered(it, x, quote) })
        else -> op
    }

    private fun frameOps(frame: CardDecor.Frame, width: Double, height: Double): List<CardOp> {
        if (frame != CardDecor.Frame.BORDER) return emptyList()
        val inset = BORDER_INSET
        val line = BORDER_WIDTH
        val ink = palette.accent.withAlpha(0.55)
        return listOf(
            CardOp.Bar(inset, inset, width - 2 * inset, line, 0.0, ink),
            CardOp.Bar(inset, height - inset - line, width - 2 * inset, line, 0.0, ink),
            CardOp.Bar(inset, inset, line, height - 2 * inset, 0.0, ink),
            CardOp.Bar(width - inset - line, inset, line, height - 2 * inset, 0.0, ink),
        )
    }

    private fun panelOps(frame: CardDecor.Frame, bounds: Bounds, width: Double): List<CardOp> {
        if (frame != CardDecor.Frame.PANEL) return emptyList()
        val pad = PANEL_PADDING
        val left = maxOf(24.0, bounds.minX - pad)
        val right = minOf(width - 24, bounds.maxX + pad)
        val color = if (palette.tone == CardTone.DARK) CardColor.rgba(255, 255, 255, 0.08) else CardColor.rgba(255, 255, 255, 0.62)
        return listOf(CardOp.Panel(left, bounds.minY - pad, right - left, bounds.maxY - bounds.minY + 2 * pad, PANEL_RADIUS, color))
    }

    private fun ornamentOps(decor: CardDecor, bounds: Bounds, centerX: Double): List<CardOp> {
        val centered = decor.alignment == CardDecor.Alignment.CENTER
        return when (decor.ornament) {
            CardDecor.Ornament.NONE -> emptyList()
            CardDecor.Ornament.ACCENT_RULE -> listOf(
                CardOp.Bar(
                    x = if (centered) centerX - RULE_WIDTH / 2 else bounds.minX, y = maxOf(24.0, bounds.minY - 64),
                    width = RULE_WIDTH, height = RULE_HEIGHT, radius = RULE_HEIGHT / 2, color = palette.accent,
                ),
            )
            CardDecor.Ornament.QUOTE_MARK -> listOf(
                CardOp.Text(
                    text = "“", x = if (centered) centerX else bounds.minX - 24, y = bounds.minY + QUOTE_MARK_SIZE * 0.55,
                    font = CardFont(CardTemplates.guillemetFace, QUOTE_MARK_SIZE), color = palette.accent.withAlpha(0.28),
                    align = if (centered) CardAlignment.CENTER else CardAlignment.LEFT, direction = CardTextDirection.LTR,
                ),
            )
        }
    }

    /** Une carte inclinée emporte son panneau et son ornement avec elle. */
    private fun tilted(ops: List<CardOp>, bounds: Bounds, width: Double): List<CardOp> {
        val tilt = input.tilt.radians
        if (tilt == 0.0 || ops.isEmpty()) return ops
        return listOf(CardOp.Group(tilt, width / 2, (bounds.minY + bounds.maxY) / 2, ops))
    }

    data class Bounds(val minX: Double, val minY: Double, val maxX: Double, val maxY: Double)

    companion object {
        const val PANEL_PADDING = 56.0
        const val PANEL_RADIUS = 44.0
        const val BORDER_INSET = 44.0
        const val BORDER_WIDTH = 3.0
        const val RULE_WIDTH = 120.0
        const val RULE_HEIGHT = 10.0
        const val QUOTE_MARK_SIZE = 260.0

        /** Ce que le contenu occupe — l'en-tête compris, le fond jamais. */
        fun contentBounds(regions: List<CardRegion>): Bounds? {
            val parts = regions.filter { it.part != CardPartId.BACKGROUND && it.height > 0 }
            if (parts.isEmpty()) return null
            return Bounds(parts.minOf { it.x }, parts.minOf { it.y }, parts.maxOf { it.x + it.width }, parts.maxOf { it.y + it.height })
        }

        /** La colonne du texte : celle de la réponse, sinon de la citation. */
        fun textColumn(regions: List<CardRegion>): CardRegion? =
            regions.firstOrNull { it.part == CardPartId.REPLY } ?: regions.firstOrNull { it.part == CardPartId.QUOTE }

        private fun startsTheLine(text: CardOp.Text): Boolean =
            (text.align == CardAlignment.LEFT && text.direction == CardTextDirection.LTR) ||
                (text.align == CardAlignment.RIGHT && text.direction == CardTextDirection.RTL)

        private fun isQuoteBar(bar: CardOp.Bar, quote: CardRegion?): Boolean {
            if (quote == null || bar.width != CardMetrics.BAR_WIDTH) return false
            return abs(bar.x - quote.x) < 1 || abs(bar.x + bar.width - (quote.x + quote.width)) < 1
        }
    }
}

internal fun CardColor.withAlpha(value: Double): CardColor = copy(alpha = alpha * value)
