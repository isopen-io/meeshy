package me.meeshy.app.chat.export

import kotlin.math.floor
import kotlin.math.pow

/** Les mesures d'une carte, en pixels de la carte. */
internal object CardMetrics {
    const val PAD_X = 96.0
    const val QUOTE_INDENT = 40.0
    const val BAR_WIDTH = 6.0
    const val AUTHOR_SIZE = 30.0
    const val AUTHOR_LINE = 44.0
    const val AUTHOR_GAP = 14.0
    const val TIME_SIZE = 26.0
    const val TITLE_SIZE = 34.0
    const val TITLE_LINE = 46.0
    const val DATE_SIZE = 26.0
    const val DATE_LINE = 38.0
    const val HEADER_GAP = 56.0
    const val REPLY_START = 68.0
    const val REPLY_FLOOR = 36.0
    const val QUOTE_START = 40.0
    const val QUOTE_FLOOR = 26.0
    const val REPLY_LEADING = 1.3
    const val QUOTE_LEADING = 1.38
    const val SHRINK = 0.92
    const val BUBBLE_OFFSET = 72.0
    const val BUBBLE_PAD_X = 40.0
    const val BUBBLE_PAD_Y = 34.0
    const val BUBBLE_RADIUS = 36.0
    const val FLOOR_STEP = 64

    fun padY(aspect: CardAspect): Double = when (aspect) {
        CardAspect.AUTO, CardAspect.STORY -> 136.0
        CardAspect.PORTRAIT -> 120.0
        CardAspect.SQUARE -> 104.0
        CardAspect.LANDSCAPE -> 88.0
    }

    fun padX(aspect: CardAspect): Double = if (aspect == CardAspect.LANDSCAPE) 140.0 else PAD_X
}

/** La géométrie de chaque liaison : la hauteur du bloc qui sépare la citation de la réponse. */
private data class LinkGeometry(val block: Double, val quoteBar: Boolean, val bubbles: Boolean) {
    companion object {
        fun of(link: CardLinkId) = when (link) {
            CardLinkId.ORBITE -> LinkGeometry(132.0, quoteBar = true, bubbles = false)
            CardLinkId.FILET -> LinkGeometry(104.0, quoteBar = true, bubbles = false)
            CardLinkId.GUILLEMETS -> LinkGeometry(150.0, quoteBar = false, bubbles = false)
            CardLinkId.FLECHE -> LinkGeometry(112.0, quoteBar = true, bubbles = false)
            CardLinkId.BULLES -> LinkGeometry(44.0, quoteBar = false, bubbles = true)
            CardLinkId.FIL -> LinkGeometry(120.0, quoteBar = true, bubbles = false)
            CardLinkId.SILENCE -> LinkGeometry(88.0, quoteBar = false, bubbles = false)
        }
    }
}

private class Sized(
    val replySize: Double,
    val quoteSize: Double,
    val replyFont: CardFont,
    val quoteFont: CardFont,
    var replyLines: List<String>,
    var quoteLines: List<String>,
)

private class Chrome(
    val header: Double,
    val quoteAuthor: Double,
    val replyAuthor: Double,
    val quoteBubble: Double,
    val replyBubble: Double,
    val link: Double,
    val media: Double,
)

/** JS `Math.round` — la moitié monte, comme sur le web et iOS. */
internal fun cardRound(value: Double): Double = floor(value + 0.5)

private fun replyLineHeight(size: Double) = cardRound(size * CardMetrics.REPLY_LEADING)
private fun quoteLineHeight(size: Double) = cardRound(size * CardMetrics.QUOTE_LEADING)

/**
 * LA MISE EN PAGE D'UNE CARTE — loi pure, miroir (texte, citation, liaison, réponse, médias dessous) de
 * `MessageCardLayoutEngine.swift`. La mesure est injectée. La lecture de haut en bas est celle du
 * fil : l'en-tête optionnel, la citation en taille réduite, la LIAISON du template, la réponse en
 * grand. Un texte long réduit ses polices pas à pas jusqu'à un plancher ; ce n'est qu'au plancher
 * qu'il est tronqué — la citation d'abord.
 */
object CardLayoutEngine {

    fun layout(input: CardInput, measure: CardMeasure): CardLayout = Run(input, measure).layout()

    private class Run(val input: CardInput, val measure: CardMeasure) {
        val palette = input.template.palette.palette
        val typeface = input.template.typeface.typeface
        val geometry = LinkGeometry.of(input.template.link)
        val title = CardText.nonBlank(input.title)
        val date = CardText.nonBlank(input.date)
        val aspect = input.aspect
        val width = aspect.width
        val padX = CardMetrics.padX(aspect)
        val padY = CardMetrics.padY(aspect)
        val left = padX
        val right = width - padX
        val textWidth = right - left
        val bubbleWidth = textWidth - CardMetrics.BUBBLE_OFFSET
        val quoteWidth = if (geometry.bubbles) bubbleWidth - 2 * CardMetrics.BUBBLE_PAD_X else textWidth - CardMetrics.QUOTE_INDENT
        val replyWidth = if (geometry.bubbles) bubbleWidth - 2 * CardMetrics.BUBBLE_PAD_X else textWidth
        val quoted = input.quoted?.takeIf { CardText.nonBlank(it.text) != null }
        val hasQuote = quoted != null
        val maxHeight = aspect.fixedHeight ?: CardLayout.MAX_HEIGHT
        val budget = maxHeight - 2 * padY
        val authorLine = CardMetrics.AUTHOR_LINE + CardMetrics.AUTHOR_GAP
        val hasReplyText = CardText.nonBlank(input.reply.text) != null
        val mediaBlock = CardMediaLayout.plan(input.media, textWidth, budget)
        val mediaGap = if (hasReplyText && mediaBlock.tiles.isNotEmpty()) CardMediaLayout.BLOCK_GAP else 0.0
        val chrome = Chrome(
            header = if (title == null && date == null) 0.0 else
                (if (title == null) 0.0 else CardMetrics.TITLE_LINE) + (if (date == null) 0.0 else CardMetrics.DATE_LINE) + CardMetrics.HEADER_GAP,
            quoteAuthor = if (input.showAuthors || input.quotedTime != null) authorLine else 0.0,
            replyAuthor = if (input.showAuthors || input.replyTime != null) authorLine else 0.0,
            quoteBubble = if (geometry.bubbles) 2 * CardMetrics.BUBBLE_PAD_Y else 0.0,
            replyBubble = if (geometry.bubbles && hasReplyText) 2 * CardMetrics.BUBBLE_PAD_Y else 0.0,
            link = geometry.block,
            media = if (mediaBlock.tiles.isEmpty()) 0.0 else mediaBlock.height + mediaGap,
        )

        fun sizeAt(step: Int): Sized {
            val factor = CardMetrics.SHRINK.pow(step)
            val replySize = maxOf(CardMetrics.REPLY_FLOOR * typeface.replyScale, CardMetrics.REPLY_START * typeface.replyScale * factor)
            val quoteSize = maxOf(CardMetrics.QUOTE_FLOOR, CardMetrics.QUOTE_START * factor)
            val replyFont = CardFont(typeface.replyFace, cardRound(replySize))
            val quoteFont = CardFont(typeface.quoteFace, cardRound(quoteSize))
            return Sized(
                replySize, quoteSize, replyFont, quoteFont,
                replyLines = if (hasReplyText) CardText.wrap(input.reply.text, replyWidth, replyFont, measure) else emptyList(),
                quoteLines = quoted?.let { CardText.wrap(it.text, quoteWidth, quoteFont, measure) } ?: emptyList(),
            )
        }

        fun contentHeight(sized: Sized): Double {
            val quote = if (hasQuote) chrome.quoteAuthor + sized.quoteLines.size * quoteLineHeight(sized.quoteSize) + chrome.quoteBubble + chrome.link else 0.0
            val reply = chrome.replyAuthor + sized.replyLines.size * replyLineHeight(sized.replySize) + chrome.replyBubble
            return chrome.header + quote + reply + chrome.media
        }

        fun atFloor(sized: Sized) =
            sized.replySize <= CardMetrics.REPLY_FLOOR * typeface.replyScale && sized.quoteSize <= CardMetrics.QUOTE_FLOOR

        fun layout(): CardLayout {
            var step = 0
            var sized = sizeAt(step)
            while (contentHeight(sized) > budget && !atFloor(sized)) {
                step += 1
                sized = sizeAt(step)
            }
            var truncated = false
            if (contentHeight(sized) > budget) {
                truncated = true
                truncate(sized)
            }
            val content = contentHeight(sized)
            val height = aspect.fixedHeight
                ?: if (truncated) CardLayout.MAX_HEIGHT else minOf(CardLayout.MAX_HEIGHT, maxOf(CardLayout.MIN_HEIGHT, 2 * padY + content))
            return paint(sized, height, content, truncated)
        }

        /** La citation cède d'abord : au plus un tiers de la place, deux lignes au moins. */
        fun truncate(sized: Sized) {
            val quoteLh = quoteLineHeight(sized.quoteSize)
            val replyLh = replyLineHeight(sized.replySize)
            val bare = Sized(sized.replySize, sized.quoteSize, sized.replyFont, sized.quoteFont, emptyList(), emptyList())
            val room = budget - contentHeight(bare)
            val quoteKeep = if (hasQuote) minOf(sized.quoteLines.size, maxOf(2, floor(room * 0.3 / quoteLh).toInt())) else 0
            val replyKeep = maxOf(1, floor((room - quoteKeep * quoteLh) / replyLh).toInt())
            sized.quoteLines = CardText.truncate(sized.quoteLines, quoteKeep, quoteWidth, sized.quoteFont, measure)
            sized.replyLines = CardText.truncate(sized.replyLines, replyKeep, replyWidth, sized.replyFont, measure)
        }

        fun paint(sized: Sized, height: Double, content: Double, truncated: Boolean): CardLayout {
            val painter = Painter(left, right, padY + maxOf(0.0, floor((height - 2 * padY - content) / 2)), input, bubbleWidth, palette, measure)
            val regions = mutableListOf<CardRegion>()
            fun region(part: CardPartId, top: Double, bottom: Double) {
                regions.add(CardRegion(part, left, top, textWidth, bottom - top))
            }
            var headerOps: List<CardOp> = emptyList()
            if (chrome.header > 0) headerOps = header(painter, ::region)
            val contentTop = painter.y
            if (quoted != null) quoteBlock(painter, quoted, sized, ::region)
            val replyStyle = BlockStyle(
                size = sized.replySize, lineHeight = replyLineHeight(sized.replySize), font = sized.replyFont, ink = palette.replyInk,
                inset = 0.0, bubble = if (geometry.bubbles && hasReplyText) BubbleStyle(CardMetrics.BUBBLE_OFFSET, palette.replyPanel) else null,
            )
            if (hasReplyText || chrome.replyAuthor > 0) {
                val reply = painter.block(input.reply, sized.replyLines, input.replyTime, replyStyle)
                region(CardPartId.REPLY, reply.top, painter.y)
            }
            mediaOps(painter)
            val tilt = input.tilt.radians
            val contentOps: List<CardOp> = if (tilt == 0.0 || painter.ops.isEmpty()) painter.ops
            else listOf(CardOp.Group(tilt, width / 2, contentTop + (painter.y - contentTop) / 2, painter.ops.toList()))
            return CardLayout(width, height, headerOps + contentOps, regions, CardLayout.watermark(input.handle), truncated)
        }

        /** Les médias sous la réponse, dans sa colonne ([CardMediaLayout]). */
        fun mediaOps(painter: Painter) {
            if (mediaBlock.tiles.isEmpty()) return
            painter.y += mediaGap
            mediaBlock.tiles.forEach { tile ->
                painter.ops.add(
                    CardOp.Picture(tile.media, left + tile.x, painter.y + tile.y, tile.width, tile.height, CardMediaLayout.RADIUS, tile.overflow),
                )
            }
            painter.y += mediaBlock.height
        }

        fun header(painter: Painter, region: (CardPartId, Double, Double) -> Unit): List<CardOp> {
            val top = painter.y
            if (title != null) {
                val direction = CardText.direction(title)
                val font = CardFont(CardFace.system(800), CardMetrics.TITLE_SIZE)
                val line = CardText.truncate(CardText.wrap(title, textWidth, font, measure), 1, textWidth, font, measure).firstOrNull() ?: title
                painter.text(line, painter.start(direction == CardTextDirection.RTL, 0.0), painter.y + font.size, font, palette.replyInk, direction)
                painter.y += CardMetrics.TITLE_LINE
            }
            if (date != null) {
                val direction = CardText.direction(date)
                val font = CardFont(CardFace.system(500), CardMetrics.DATE_SIZE)
                painter.text(date, painter.start(direction == CardTextDirection.RTL, 0.0), painter.y + font.size, font, palette.quoteInk, direction)
                painter.y += CardMetrics.DATE_LINE
            }
            region(CardPartId.HEADER, top, painter.y)
            painter.y += CardMetrics.HEADER_GAP
            val ops = painter.ops.toList()
            painter.ops.clear()
            return ops
        }

        fun quoteBlock(painter: Painter, quoted: CardPart, sized: Sized, region: (CardPartId, Double, Double) -> Unit) {
            val quote = painter.block(
                quoted, sized.quoteLines, input.quotedTime,
                BlockStyle(
                    size = sized.quoteSize, lineHeight = quoteLineHeight(sized.quoteSize), font = sized.quoteFont, ink = palette.quoteInk,
                    inset = if (geometry.quoteBar) CardMetrics.QUOTE_INDENT else 0.0,
                    bubble = if (geometry.bubbles) BubbleStyle(0.0, palette.quotePanel) else null,
                ),
            )
            if (geometry.quoteBar) {
                painter.ops.add(
                    CardOp.Bar(
                        x = if (quote.rtl) right - CardMetrics.BAR_WIDTH else left, y = quote.top, width = CardMetrics.BAR_WIDTH,
                        height = painter.y - quote.top, radius = CardMetrics.BAR_WIDTH / 2, color = palette.accent,
                    ),
                )
            }
            region(CardPartId.QUOTE, quote.top, painter.y)
            painter.ops.addAll(linkOps(painter.y, quote.rtl))
            region(CardPartId.LINK, painter.y, painter.y + geometry.block)
            painter.y += geometry.block
        }

        /** Ce que la liaison peint dans son bloc, entre le bas de la citation (y) et la réponse. */
        fun linkOps(y: Double, rtl: Boolean): List<CardOp> {
            val accent = palette.accent
            val edge = if (rtl) right else left
            val toward = if (rtl) -1.0 else 1.0
            val block = geometry.block
            return when (input.template.link) {
                CardLinkId.ORBITE -> listOf(CardOp.Separator(left, right, y + block / 2, 11.0, accent, listOf(2.0, 14.0), 3.0))
                CardLinkId.FILET -> {
                    val ends = listOf(edge, edge + toward * 160).sorted()
                    listOf(CardOp.Separator(ends[0], ends[1], y + block / 2, 0.0, accent, emptyList(), 5.0))
                }
                CardLinkId.GUILLEMETS -> listOf(
                    CardOp.Text(
                        "“", edge - toward * 6, y + block - 8, CardFont(CardTemplates.guillemetFace, 190.0), accent,
                        if (rtl) CardAlignment.RIGHT else CardAlignment.LEFT, CardTextDirection.LTR,
                    ),
                )
                CardLinkId.FLECHE -> listOf(
                    CardOp.Text(
                        if (rtl) "↲" else "↳", edge + toward * CardMetrics.QUOTE_INDENT, y + cardRound(block * 0.7),
                        CardFont(CardFace.system(700), 60.0), accent,
                        if (rtl) CardAlignment.RIGHT else CardAlignment.LEFT, CardTextDirection.LTR,
                    ),
                )
                CardLinkId.FIL -> {
                    val x = if (rtl) right - CardMetrics.BAR_WIDTH / 2 else left + CardMetrics.BAR_WIDTH / 2
                    listOf(
                        CardOp.Bar(x - 1.5, y + 10, 3.0, block - 44, 1.5, accent),
                        CardOp.Dot(x, y + block - 26, 10.0, accent),
                    )
                }
                CardLinkId.BULLES, CardLinkId.SILENCE -> emptyList()
            }
        }
    }
}

private class BubbleStyle(val offset: Double, val color: CardColor)

private class BlockStyle(
    val size: Double,
    val lineHeight: Double,
    val font: CardFont,
    val ink: CardColor,
    val inset: Double,
    val bubble: BubbleStyle?,
)

/** Le curseur vertical et les opérations accumulées. */
private class Painter(
    val left: Double,
    val right: Double,
    var y: Double,
    val input: CardInput,
    val bubbleWidth: Double,
    val palette: CardPalette,
    val measure: CardMeasure,
) {
    val ops = mutableListOf<CardOp>()

    fun start(rtl: Boolean, inset: Double) = if (rtl) right - inset else left + inset

    fun text(text: String, x: Double, baseline: Double, font: CardFont, color: CardColor, direction: CardTextDirection) {
        ops.add(CardOp.Text(text, x, baseline, font, color, if (direction == CardTextDirection.RTL) CardAlignment.RIGHT else CardAlignment.LEFT, direction))
    }

    /** La ligne du nom (et de l'heure) : au-dessus du texte, ou en signature « — Nom · 14:32 » à la fin. */
    private fun nameLine(name: String, time: String?, from: Double, to: Double, rtl: Boolean) {
        val named = if (input.showAuthors) name else null
        if (named == null && time == null) return
        val authorFont = CardFont(CardFace.system(600), CardMetrics.AUTHOR_SIZE)
        val timeFont = CardFont(CardFace.system(500), CardMetrics.TIME_SIZE)
        val baseline = y + authorFont.size
        when (input.authorPlacement) {
            CardAuthorPlacement.ABOVE -> {
                if (named != null) {
                    ops.add(CardOp.Text(named, from, baseline, authorFont, palette.authorInk, if (rtl) CardAlignment.RIGHT else CardAlignment.LEFT, CardText.direction(named)))
                }
                if (time != null) {
                    ops.add(CardOp.Text(time, to, baseline, timeFont, palette.quoteInk, if (rtl) CardAlignment.LEFT else CardAlignment.RIGHT, CardTextDirection.LTR))
                }
            }
            CardAuthorPlacement.AFTER -> {
                val signature = listOfNotNull(named?.let { "— $it" }, time).joinToString(" · ")
                ops.add(CardOp.Text(signature, to, baseline, authorFont, palette.authorInk, if (rtl) CardAlignment.LEFT else CardAlignment.RIGHT, CardText.direction(signature)))
            }
        }
        y += CardMetrics.AUTHOR_LINE + CardMetrics.AUTHOR_GAP
    }

    class Placed(val top: Double, val rtl: Boolean)

    /** Un bloc : son nom, ses lignes — et, pour la liaison « bulles », la bulle qui les porte. */
    fun block(part: CardPart, lines: List<String>, time: String?, style: BlockStyle): Placed {
        val direction = CardText.direction(part.text)
        val rtl = direction == CardTextDirection.RTL
        val top = y
        val panelIndex = ops.size
        val inset = style.bubble?.let { it.offset + CardMetrics.BUBBLE_PAD_X } ?: style.inset
        val startX = start(rtl, inset)
        val endX = if (style.bubble != null) {
            val far = style.bubble.offset + bubbleWidth - CardMetrics.BUBBLE_PAD_X
            if (rtl) right - far else left + far
        } else {
            if (rtl) left else right
        }
        if (style.bubble != null) y += CardMetrics.BUBBLE_PAD_Y
        if (input.authorPlacement == CardAuthorPlacement.ABOVE) nameLine(part.author, time, startX, endX, rtl)
        for (line in lines) {
            text(line, startX, y + cardRound(style.size), style.font, style.ink, direction)
            y += style.lineHeight
        }
        if (input.authorPlacement == CardAuthorPlacement.AFTER) nameLine(part.author, time, startX, endX, rtl)
        style.bubble?.let { bubble ->
            y += CardMetrics.BUBBLE_PAD_Y
            val x = if (rtl) right - bubble.offset - bubbleWidth else left + bubble.offset
            ops.add(panelIndex, CardOp.Panel(x, top, bubbleWidth, y - top, CardMetrics.BUBBLE_RADIUS, bubble.color))
        }
        return Placed(top, rtl)
    }
}
