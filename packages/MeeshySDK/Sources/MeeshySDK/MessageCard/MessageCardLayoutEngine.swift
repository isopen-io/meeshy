import Foundation

/// Les mesures d'une carte, en pixels de la carte.
enum MessageCardMetrics {
    static let padX: Double = 96
    static let padY: Double = 136
    static let quoteIndent: Double = 40
    static let barWidth: Double = 6
    static let authorSize: Double = 30
    static let authorLine: Double = 44
    static let authorGap: Double = 14
    static let timeSize: Double = 26
    static let titleSize: Double = 34
    static let titleLine: Double = 46
    static let dateSize: Double = 26
    static let dateLine: Double = 38
    static let headerGap: Double = 56
    static let replyStart: Double = 68
    static let replyFloor: Double = 36
    static let quoteStart: Double = 40
    static let quoteFloor: Double = 26
    static let replyLeading: Double = 1.3
    static let quoteLeading: Double = 1.38
    static let shrink: Double = 0.92
    static let bubbleOffset: Double = 72
    static let bubblePadX: Double = 40
    static let bubblePadY: Double = 34
    static let bubbleRadius: Double = 36
    /// La colonne d'un en-tête VERTICAL (#8692).
    static let gutter: Double = 84
    static let gutterGap: Double = 28
    static let mediaGap: Double = 40
    static let mediaRadius: Double = 28
}

/// La TOILE : sa largeur, sa hauteur fixe éventuelle, ses marges et la colonne d'en-tête.
struct MessageCardCanvas {
    let width: Double
    let fixedHeight: Double?
    let padX: Double
    let padY: Double
    let gutter: Double

    var left: Double { padX + gutter }
    var right: Double { width - padX }
    var textWidth: Double { right - left }
    var maxHeight: Double { fixedHeight ?? MessageCardLayout.maxHeight }
    var budget: Double { maxHeight - 2 * padY }

    static func of(_ aspect: MessageCardAspect, verticalHeader: Bool) -> MessageCardCanvas {
        let padY: Double
        switch aspect {
        case .auto, .story: padY = MessageCardMetrics.padY
        case .portrait: padY = 120
        case .square: padY = 104
        case .landscape: padY = 88
        }
        return MessageCardCanvas(
            width: aspect.width,
            fixedHeight: aspect.fixedHeight,
            padX: aspect == .landscape ? 140 : MessageCardMetrics.padX,
            padY: padY,
            gutter: verticalHeader ? MessageCardMetrics.gutter + MessageCardMetrics.gutterGap : 0
        )
    }
}

/// La géométrie de chaque liaison : la hauteur du bloc qui sépare la citation
/// de la réponse, et ce que la citation porte — son filet vertical, ou une bulle.
struct MessageCardLinkGeometry {
    let block: Double
    let quoteBar: Bool
    let bubbles: Bool

    static func of(_ link: MessageCardLinkID) -> MessageCardLinkGeometry {
        switch link {
        case .orbite: return MessageCardLinkGeometry(block: 132, quoteBar: true, bubbles: false)
        case .filet: return MessageCardLinkGeometry(block: 104, quoteBar: true, bubbles: false)
        case .guillemets: return MessageCardLinkGeometry(block: 150, quoteBar: false, bubbles: false)
        case .fleche: return MessageCardLinkGeometry(block: 112, quoteBar: true, bubbles: false)
        case .bulles: return MessageCardLinkGeometry(block: 44, quoteBar: false, bubbles: true)
        case .fil: return MessageCardLinkGeometry(block: 120, quoteBar: true, bubbles: false)
        case .silence: return MessageCardLinkGeometry(block: 88, quoteBar: false, bubbles: false)
        }
    }
}

private struct Sized {
    var replySize: Double
    var quoteSize: Double
    var replyFont: MessageCardFont
    var quoteFont: MessageCardFont
    var replyLines: [String]
    var quoteLines: [String]
}

private struct Chrome {
    let header: Double
    let quoteAuthor: Double
    let replyAuthor: Double
    let quoteBubble: Double
    let replyBubble: Double
    let link: Double
    let mediaAbove: Double
    let mediaBelow: Double
}

/// JS `Math.round` — la moitié monte, comme sur le web.
func messageCardRound(_ value: Double) -> Double { (value + 0.5).rounded(.down) }

private func replyLineHeight(_ size: Double) -> Double { messageCardRound(size * MessageCardMetrics.replyLeading) }
private func quoteLineHeight(_ size: Double) -> Double { messageCardRound(size * MessageCardMetrics.quoteLeading) }

struct MessageCardLayoutEngine {
    let input: MessageCardInput
    let measure: MessageCardMeasure

    var palette: MessageCardPalette { input.template.palette.palette }
    private var typeface: MessageCardTypeface { input.template.typeface.typeface }

    private func contentHeight(_ sized: Sized, hasQuote: Bool, chrome: Chrome) -> Double {
        let quote = hasQuote
            ? chrome.quoteAuthor + Double(sized.quoteLines.count) * quoteLineHeight(sized.quoteSize) + chrome.quoteBubble + chrome.link
            : 0
        return chrome.header + quote + chrome.mediaAbove + chrome.replyAuthor
            + Double(sized.replyLines.count) * replyLineHeight(sized.replySize) + chrome.replyBubble + chrome.mediaBelow
    }

    func layout() -> MessageCardLayout {
        let disposition = input.disposition
        let geometry = MessageCardLinkGeometry.of(input.template.link)
        let title = MessageCardText.nonBlank(input.title)
        let date = MessageCardText.nonBlank(input.date)
        let verticalHeader = disposition.headerOrientation.isVertical && (title != nil || date != nil)
        let canvas = MessageCardCanvas.of(disposition.aspect, verticalHeader: verticalHeader)
        let width = canvas.width
        let textWidth = canvas.textWidth
        let bubbleWidth = textWidth - MessageCardMetrics.bubbleOffset
        let quoteWidth = geometry.bubbles ? bubbleWidth - 2 * MessageCardMetrics.bubblePadX : textWidth - MessageCardMetrics.quoteIndent
        let replyWidth = geometry.bubbles ? bubbleWidth - 2 * MessageCardMetrics.bubblePadX : textWidth
        let quoted = input.quoted.flatMap { MessageCardText.nonBlank($0.text) == nil ? nil : $0 }
        let hasQuote = quoted != nil
        let budget = canvas.budget
        let showAuthors = input.showAuthors
        let media = MessageCardMediaPlan.of(input.media, layout: disposition.mediaLayout, audioStyle: disposition.audioStyle, width: textWidth, budget: budget)
        let authorLine = MessageCardMetrics.authorLine + MessageCardMetrics.authorGap
        let hasReplyText = MessageCardText.nonBlank(input.reply.text) != nil
        let chrome = Chrome(
            header: verticalHeader || (title == nil && date == nil)
                ? 0
                : (title == nil ? 0 : MessageCardMetrics.titleLine) + (date == nil ? 0 : MessageCardMetrics.dateLine) + MessageCardMetrics.headerGap,
            quoteAuthor: showAuthors || input.quotedTime != nil ? authorLine : 0,
            replyAuthor: showAuthors || input.replyTime != nil ? authorLine : 0,
            quoteBubble: geometry.bubbles ? 2 * MessageCardMetrics.bubblePadY : 0,
            replyBubble: geometry.bubbles && hasReplyText ? 2 * MessageCardMetrics.bubblePadY : 0,
            link: geometry.block,
            mediaAbove: media.above.map { $0.height + (hasReplyText ? MessageCardMetrics.mediaGap : 0) } ?? 0,
            mediaBelow: media.below.map { $0.height + (hasReplyText ? MessageCardMetrics.mediaGap : 0) } ?? 0
        )

        let sizeAt: (Int) -> Sized = { step in
            let factor = pow(MessageCardMetrics.shrink, Double(step))
            let replySize = max(MessageCardMetrics.replyFloor * typeface.replyScale, MessageCardMetrics.replyStart * typeface.replyScale * factor)
            let quoteSize = max(MessageCardMetrics.quoteFloor, MessageCardMetrics.quoteStart * factor)
            let replyFont = MessageCardFont(face: typeface.replyFace, size: replySize)
            let quoteFont = MessageCardFont(face: typeface.quoteFace, size: quoteSize)
            return Sized(
                replySize: replySize,
                quoteSize: quoteSize,
                replyFont: replyFont,
                quoteFont: quoteFont,
                replyLines: hasReplyText ? MessageCardText.wrap(input.reply.text, maxWidth: replyWidth, font: replyFont, measure: measure) : [],
                quoteLines: quoted.map { MessageCardText.wrap($0.text, maxWidth: quoteWidth, font: quoteFont, measure: measure) } ?? []
            )
        }

        let atFloor: (Sized) -> Bool = {
            $0.replySize <= MessageCardMetrics.replyFloor * typeface.replyScale && $0.quoteSize <= MessageCardMetrics.quoteFloor
        }
        var step = 0
        var sized = sizeAt(step)
        while contentHeight(sized, hasQuote: hasQuote, chrome: chrome) > budget && !atFloor(sized) {
            step += 1
            sized = sizeAt(step)
        }

        var truncated = false
        if contentHeight(sized, hasQuote: hasQuote, chrome: chrome) > budget {
            truncated = true
            let quoteLH = quoteLineHeight(sized.quoteSize)
            let replyLH = replyLineHeight(sized.replySize)
            var bare = sized
            bare.quoteLines = []
            bare.replyLines = []
            let room = budget - contentHeight(bare, hasQuote: hasQuote, chrome: chrome)
            // La citation cède d'abord : au plus un tiers de la place, deux lignes au moins.
            let quoteKeep = hasQuote ? min(sized.quoteLines.count, max(2, Int(((room * 0.3) / quoteLH).rounded(.down)))) : 0
            let replyKeep = max(1, Int(((room - Double(quoteKeep) * quoteLH) / replyLH).rounded(.down)))
            sized.quoteLines = MessageCardText.truncate(sized.quoteLines, count: quoteKeep, maxWidth: quoteWidth, font: sized.quoteFont, measure: measure)
            sized.replyLines = MessageCardText.truncate(sized.replyLines, count: replyKeep, maxWidth: replyWidth, font: sized.replyFont, measure: measure)
        }

        let content = contentHeight(sized, hasQuote: hasQuote, chrome: chrome)
        let height: Double
        if let fixed = canvas.fixedHeight {
            height = fixed
        } else {
            height = truncated
                ? MessageCardLayout.maxHeight
                : min(MessageCardLayout.maxHeight, max(MessageCardLayout.minHeight, 2 * canvas.padY + content))
        }

        var painter = MessageCardPainter(
            left: canvas.left,
            right: canvas.right,
            // Un texte court flotte au milieu de l'espace libre, jamais collé en haut.
            y: canvas.padY + max(0, ((height - 2 * canvas.padY - content) / 2).rounded(.down)),
            showAuthors: showAuthors,
            placement: disposition.authorPlacement,
            authorInk: palette.authorInk,
            timeInk: palette.quoteInk,
            bubbleWidth: bubbleWidth,
            measure: measure
        )

        var regions: [MessageCardRegion] = []
        let region: (MessageCardPartID, Double, Double) -> Void = { part, top, bottom in
            regions.append(MessageCardRegion(part: part, x: canvas.left, y: top, width: textWidth, height: bottom - top))
        }

        var headerOps: [MessageCardOp] = []
        if verticalHeader {
            headerOps = verticalHeaderOps(title: title, date: date, canvas: canvas, height: height)
            regions.append(MessageCardRegion(part: .header, x: canvas.padX, y: canvas.padY, width: MessageCardMetrics.gutter, height: height - 2 * canvas.padY))
        } else if chrome.header > 0 {
            let headerTop = painter.y
            if let title {
                let direction = MessageCardText.direction(of: title)
                let font = MessageCardFont(face: .system(800), size: MessageCardMetrics.titleSize)
                let line = MessageCardText.truncate(MessageCardText.wrap(title, maxWidth: textWidth, font: font, measure: measure), count: 1, maxWidth: textWidth, font: font, measure: measure).first ?? title
                painter.text(line, x: painter.start(rtl: direction == .rtl, inset: 0), baseline: painter.y + MessageCardMetrics.titleSize, font: font, color: palette.replyInk, direction: direction)
                painter.y += MessageCardMetrics.titleLine
            }
            if let date {
                let direction = MessageCardText.direction(of: date)
                let font = MessageCardFont(face: .system(500), size: MessageCardMetrics.dateSize)
                painter.text(date, x: painter.start(rtl: direction == .rtl, inset: 0), baseline: painter.y + MessageCardMetrics.dateSize, font: font, color: palette.quoteInk, direction: direction)
                painter.y += MessageCardMetrics.dateLine
            }
            region(.header, headerTop, painter.y)
            painter.y += MessageCardMetrics.headerGap
            headerOps = painter.ops
            painter.ops = []
        }

        let contentTop = painter.y

        if let quoted {
            let quote = painter.block(quoted, lines: sized.quoteLines, time: input.quotedTime, style: MessageCardBlockStyle(
                size: sized.quoteSize,
                lineHeight: quoteLineHeight(sized.quoteSize),
                font: sized.quoteFont,
                ink: palette.quoteInk,
                inset: geometry.quoteBar ? MessageCardMetrics.quoteIndent : 0,
                bubble: geometry.bubbles ? MessageCardBubbleStyle(offset: 0, color: palette.quotePanel) : nil
            ))
            if geometry.quoteBar {
                painter.ops.append(.bar(MessageCardRectOp(
                    x: quote.rtl ? canvas.right - MessageCardMetrics.barWidth : canvas.left,
                    y: quote.top,
                    width: MessageCardMetrics.barWidth,
                    height: painter.y - quote.top,
                    radius: MessageCardMetrics.barWidth / 2,
                    color: palette.accent
                )))
            }
            region(.quote, quote.top, painter.y)
            painter.ops.append(contentsOf: linkOps(input.template.link, y: painter.y, rtl: quote.rtl, canvas: canvas, block: geometry.block))
            region(.link, painter.y, painter.y + geometry.block)
            painter.y += geometry.block
        }

        if let above = media.above {
            painter.ops.append(contentsOf: mediaOps(above, x: canvas.left, y: painter.y, width: textWidth))
            region(.media, painter.y, painter.y + above.height)
            painter.y += chrome.mediaAbove
        }

        if hasReplyText || chrome.replyAuthor > 0 {
            let reply = painter.block(input.reply, lines: sized.replyLines, time: input.replyTime, style: MessageCardBlockStyle(
                size: sized.replySize,
                lineHeight: replyLineHeight(sized.replySize),
                font: sized.replyFont,
                ink: palette.replyInk,
                inset: 0,
                bubble: geometry.bubbles && hasReplyText ? MessageCardBubbleStyle(offset: MessageCardMetrics.bubbleOffset, color: palette.replyPanel) : nil
            ))
            region(.reply, reply.top, painter.y)
        }

        if let below = media.below {
            if hasReplyText { painter.y += MessageCardMetrics.mediaGap }
            painter.ops.append(contentsOf: mediaOps(below, x: canvas.left, y: painter.y, width: textWidth))
            region(.media, painter.y, painter.y + below.height)
            painter.y += below.height
        }

        let tilt = disposition.tilt.radians
        let contentOps: [MessageCardOp] = tilt == 0 || painter.ops.isEmpty
            ? painter.ops
            : [.group(MessageCardGroupOp(rotation: tilt, cx: width / 2, cy: contentTop + (painter.y - contentTop) / 2, ops: painter.ops))]

        return MessageCardLayout(
            width: width,
            height: height,
            backdrop: media.backdrop.map { backdropOps($0, width: width, height: height) } ?? [],
            ops: headerOps + contentOps,
            regions: regions,
            watermark: MessageCardLayout.watermark(handle: input.handle),
            truncated: truncated
        )
    }

    /// Ce que la liaison peint dans son bloc, entre le bas de la citation (`y`) et la réponse.
    private func linkOps(_ link: MessageCardLinkID, y: Double, rtl: Bool, canvas: MessageCardCanvas, block: Double) -> [MessageCardOp] {
        let accent = palette.accent
        let edge = rtl ? canvas.right : canvas.left
        let toward: Double = rtl ? -1 : 1
        switch link {
        case .orbite:
            return [.separator(MessageCardSeparatorOp(x1: canvas.left, x2: canvas.right, y: y + block / 2, radius: 11, color: accent, dash: [2, 14], lineWidth: 3))]
        case .filet:
            let ends = [edge, edge + toward * 160].sorted()
            return [.separator(MessageCardSeparatorOp(x1: ends[0], x2: ends[1], y: y + block / 2, radius: 0, color: accent, dash: [], lineWidth: 5))]
        case .guillemets:
            return [.text(MessageCardTextOp(
                text: "“", x: edge - toward * 6, y: y + block - 8,
                font: MessageCardFont(face: MessageCardTemplates.guillemetFace, size: 190),
                color: accent, align: rtl ? .right : .left, direction: .ltr
            ))]
        case .fleche:
            return [.text(MessageCardTextOp(
                text: rtl ? "↲" : "↳", x: edge + toward * MessageCardMetrics.quoteIndent, y: y + messageCardRound(block * 0.7),
                font: MessageCardFont(face: .system(700), size: 60),
                color: accent, align: rtl ? .right : .left, direction: .ltr
            ))]
        case .fil:
            let x = rtl ? canvas.right - MessageCardMetrics.barWidth / 2 : canvas.left + MessageCardMetrics.barWidth / 2
            return [
                .bar(MessageCardRectOp(x: x - 1.5, y: y + 10, width: 3, height: block - 44, radius: 1.5, color: accent)),
                .dot(MessageCardDotOp(x: x, y: y + block - 26, radius: 10, color: accent)),
            ]
        case .bulles, .silence:
            return []
        }
    }
}

struct MessageCardBubbleStyle {
    let offset: Double
    let color: MessageCardColor
}

struct MessageCardBlockStyle {
    let size: Double
    let lineHeight: Double
    let font: MessageCardFont
    let ink: MessageCardColor
    let inset: Double
    let bubble: MessageCardBubbleStyle?
}

/// Le curseur vertical et les opérations accumulées.
struct MessageCardPainter {
    let left: Double
    let right: Double
    var y: Double
    let showAuthors: Bool
    let placement: MessageCardAuthorPlacement
    let authorInk: MessageCardColor
    let timeInk: MessageCardColor
    let bubbleWidth: Double
    let measure: MessageCardMeasure
    var ops: [MessageCardOp] = []

    private static let authorFont = MessageCardFont(face: .system(600), size: MessageCardMetrics.authorSize)
    private static let timeFont = MessageCardFont(face: .system(500), size: MessageCardMetrics.timeSize)

    func start(rtl: Bool, inset: Double) -> Double {
        rtl ? right - inset : left + inset
    }

    mutating func text(_ text: String, x: Double, baseline: Double, font: MessageCardFont, color: MessageCardColor, direction: MessageCardTextDirection) {
        ops.append(.text(MessageCardTextOp(
            text: text, x: x, y: baseline, font: font, color: color,
            align: direction == .rtl ? .right : .left, direction: direction
        )))
    }

    /// La ligne du nom (et de l'heure) : au-dessus du texte, le nom au début et
    /// l'heure au bout ; en signature, « — Nom · 14:32 » au bout de la ligne.
    private mutating func nameLine(_ name: String, time: String?, from start: Double, to end: Double, rtl: Bool) {
        let named = showAuthors ? name : nil
        guard named != nil || time != nil else { return }
        let baseline = y + MessageCardMetrics.authorSize
        switch placement {
        case .above:
            if let named {
                ops.append(.text(MessageCardTextOp(
                    text: named, x: start, y: baseline, font: Self.authorFont, color: authorInk,
                    align: rtl ? .right : .left, direction: MessageCardText.direction(of: named)
                )))
            }
            if let time {
                ops.append(.text(MessageCardTextOp(
                    text: time, x: end, y: baseline, font: Self.timeFont, color: timeInk,
                    align: rtl ? .left : .right, direction: .ltr
                )))
            }
        case .after:
            let signature = [named.map { "— \($0)" }, time].compactMap { $0 }.joined(separator: " · ")
            ops.append(.text(MessageCardTextOp(
                text: signature, x: end, y: baseline, font: Self.authorFont, color: authorInk,
                align: rtl ? .left : .right, direction: MessageCardText.direction(of: signature)
            )))
        }
        y += MessageCardMetrics.authorLine + MessageCardMetrics.authorGap
    }

    /// Un bloc : son nom, ses lignes — et, pour la liaison « bulles », la bulle qui les porte.
    mutating func block(_ part: MessageCardPart, lines: [String], time: String?, style: MessageCardBlockStyle) -> (top: Double, rtl: Bool) {
        let direction = MessageCardText.direction(of: part.text)
        let rtl = direction == .rtl
        let top = y
        let panelIndex = ops.count
        let inset = style.bubble.map { $0.offset + MessageCardMetrics.bubblePadX } ?? style.inset
        let startX = start(rtl: rtl, inset: inset)
        let endX: Double
        if let bubble = style.bubble {
            let far = bubble.offset + bubbleWidth - MessageCardMetrics.bubblePadX
            endX = rtl ? right - far : left + far
        } else {
            endX = rtl ? left : right
        }
        if style.bubble != nil { y += MessageCardMetrics.bubblePadY }
        if placement == .above { nameLine(part.author, time: time, from: startX, to: endX, rtl: rtl) }
        for line in lines {
            text(line, x: startX, baseline: y + messageCardRound(style.size), font: style.font, color: style.ink, direction: direction)
            y += style.lineHeight
        }
        if placement == .after { nameLine(part.author, time: time, from: startX, to: endX, rtl: rtl) }
        if let bubble = style.bubble {
            y += MessageCardMetrics.bubblePadY
            let x = rtl ? right - bubble.offset - bubbleWidth : left + bubble.offset
            ops.insert(.panel(MessageCardRectOp(x: x, y: top, width: bubbleWidth, height: y - top, radius: MessageCardMetrics.bubbleRadius, color: bubble.color)), at: panelIndex)
        }
        return (top, rtl)
    }
}
