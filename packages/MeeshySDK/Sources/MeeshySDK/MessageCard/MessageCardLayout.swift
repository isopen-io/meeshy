import Foundation

/// **LA MISE EN PAGE D'UNE CARTE D'EXPORT** — LOI PURE, miroir de
/// `apps/web/src/lib/export/message-card-layout.ts` : aucun contexte
/// graphique. Elle reçoit une fonction de MESURE (la vraie police en
/// production, une règle fixe dans les témoins) et rend la liste des
/// opérations à peindre.
///
/// La lecture de haut en bas est celle du fil : l'en-tête optionnel (titre de
/// la conversation, date), le message CITÉ en entier et en taille RÉDUITE, la
/// LIAISON du template, puis la RÉPONSE, en bas et en grand. Aucun pied : la
/// carte est signée par son seul filigrane diagonal « Meeshy @pseudo », qui
/// reste même quand les auteurs sont anonymisés.
///
/// La carte s'adapte au texte : 1080 px de large, une hauteur entre le carré
/// (1080) et le format story (1920). Un texte long réduit ses polices pas à
/// pas jusqu'à un plancher lisible ; ce n'est qu'au plancher qu'il est
/// tronqué — la citation d'abord, la réponse en dernier.

public struct MessageCardPart: Equatable, Sendable {
    /// Le nom peint au-dessus du bloc — déjà anonymisé par l'appelant s'il l'a voulu.
    public let author: String
    public let text: String

    public init(author: String, text: String) {
        self.author = author
        self.text = text
    }
}

public struct MessageCardInput: Equatable, Sendable {
    /// Le message auquel on répond — `nil` pour un message isolé.
    public let quoted: MessageCardPart?
    public let reply: MessageCardPart
    public let template: MessageCardTemplateID
    /// Le pseudo de qui exporte — il signe le filigrane ; `nil` : la marque seule.
    public let handle: String?
    public let title: String?
    public let date: String?
    public let showAuthors: Bool

    public init(quoted: MessageCardPart?, reply: MessageCardPart, template: MessageCardTemplateID, handle: String?,
                title: String? = nil, date: String? = nil, showAuthors: Bool = true) {
        self.quoted = quoted
        self.reply = reply
        self.template = template
        self.handle = handle
        self.title = title
        self.date = date
        self.showAuthors = showAuthors
    }
}

public enum MessageCardAlignment: Equatable, Sendable {
    case left, right, center
}

public struct MessageCardTextOp: Equatable, Sendable {
    public let text: String
    public let x: Double
    /// La ligne de base.
    public let y: Double
    public let font: MessageCardFont
    public let color: MessageCardColor
    public let align: MessageCardAlignment
    public let direction: MessageCardTextDirection
}

public struct MessageCardRectOp: Equatable, Sendable {
    public let x: Double
    public let y: Double
    public let width: Double
    public let height: Double
    public let radius: Double
    public let color: MessageCardColor
}

/// Un trait horizontal — interrompu par un cercle au milieu quand `radius` > 0.
public struct MessageCardSeparatorOp: Equatable, Sendable {
    public let x1: Double
    public let x2: Double
    public let y: Double
    public let radius: Double
    public let color: MessageCardColor
    public let dash: [Double]
    public let lineWidth: Double
}

public struct MessageCardDotOp: Equatable, Sendable {
    public let x: Double
    public let y: Double
    public let radius: Double
    public let color: MessageCardColor
}

public enum MessageCardOp: Equatable, Sendable {
    case text(MessageCardTextOp)
    /// Un filet plein, aux bouts arrondis.
    case bar(MessageCardRectOp)
    case separator(MessageCardSeparatorOp)
    /// Une bulle : un rectangle arrondi sous un bloc de texte.
    case panel(MessageCardRectOp)
    case dot(MessageCardDotOp)
}

/// Les PARTIES d'une carte qu'un geste peut désigner sur l'aperçu : l'en-tête,
/// la citation, la liaison, la réponse — et le fond, partout ailleurs. Le
/// filigrane n'en est pas une : il signe toujours la carte, rien ne le règle.
public enum MessageCardPartID: String, CaseIterable, Sendable {
    case header, quote, link, reply, background
}

/// La zone d'une partie, en pixels de la carte.
public struct MessageCardRegion: Equatable, Sendable {
    public let part: MessageCardPartID
    public let x: Double
    public let y: Double
    public let width: Double
    public let height: Double
}

public struct MessageCardLayout: Equatable, Sendable {
    public let width: Double
    public let height: Double
    public let ops: [MessageCardOp]
    /// Les zones touchables, de haut en bas — seules les parties PEINTES en ont une.
    public let regions: [MessageCardRegion]
    /// Le motif du filigrane diagonal.
    public let watermark: String
    /// Vrai quand, au plancher des polices, un texte a dû être coupé.
    public let truncated: Bool

    public static let cardWidth: Double = 1080
    public static let minHeight: Double = 1080
    public static let maxHeight: Double = 1920

    /// « Meeshy @pseudo » — le pseudo sans son éventuel « @ », la marque seule quand il manque.
    public static func watermark(handle: String?) -> String {
        let bare = handle.map { String($0.drop(while: { $0 == "@" })) }
        guard let name = MessageCardText.nonBlank(bare) else { return "Meeshy" }
        return "Meeshy @\(name)"
    }

    public static func make(_ input: MessageCardInput, measure: @escaping MessageCardMeasure) -> MessageCardLayout {
        MessageCardLayoutEngine(input: input, measure: measure).layout()
    }
}

private enum Metrics {
    static let padX: Double = 96
    static let padY: Double = 136
    static let quoteIndent: Double = 40
    static let barWidth: Double = 6
    static let authorSize: Double = 30
    static let authorLine: Double = 44
    static let authorGap: Double = 14
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
}

/// La géométrie de chaque liaison : la hauteur du bloc qui sépare la citation
/// de la réponse, et ce que la citation porte — son filet vertical, ou une bulle.
private struct LinkGeometry {
    let block: Double
    let quoteBar: Bool
    let bubbles: Bool

    static func of(_ link: MessageCardLinkID) -> LinkGeometry {
        switch link {
        case .orbite: return LinkGeometry(block: 132, quoteBar: true, bubbles: false)
        case .filet: return LinkGeometry(block: 104, quoteBar: true, bubbles: false)
        case .guillemets: return LinkGeometry(block: 150, quoteBar: false, bubbles: false)
        case .fleche: return LinkGeometry(block: 112, quoteBar: true, bubbles: false)
        case .bulles: return LinkGeometry(block: 44, quoteBar: false, bubbles: true)
        case .fil: return LinkGeometry(block: 120, quoteBar: true, bubbles: false)
        case .silence: return LinkGeometry(block: 88, quoteBar: false, bubbles: false)
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
    let author: Double
    let bubble: Double
    let link: Double
}

/// JS `Math.round` — la moitié monte, comme sur le web.
private func jsRound(_ value: Double) -> Double { (value + 0.5).rounded(.down) }

private func replyLineHeight(_ size: Double) -> Double { jsRound(size * Metrics.replyLeading) }
private func quoteLineHeight(_ size: Double) -> Double { jsRound(size * Metrics.quoteLeading) }

private struct MessageCardLayoutEngine {
    let input: MessageCardInput
    let measure: MessageCardMeasure

    private var palette: MessageCardPalette { input.template.palette.palette }
    private var typeface: MessageCardTypeface { input.template.typeface.typeface }

    private func contentHeight(_ sized: Sized, hasQuote: Bool, chrome: Chrome) -> Double {
        let quote = hasQuote
            ? chrome.author + Double(sized.quoteLines.count) * quoteLineHeight(sized.quoteSize) + chrome.bubble + chrome.link
            : 0
        return chrome.header + quote + chrome.author + Double(sized.replyLines.count) * replyLineHeight(sized.replySize) + chrome.bubble
    }

    func layout() -> MessageCardLayout {
        let geometry = LinkGeometry.of(input.template.link)
        let width = MessageCardLayout.cardWidth
        let textWidth = width - 2 * Metrics.padX
        let bubbleWidth = textWidth - Metrics.bubbleOffset
        let quoteWidth = geometry.bubbles ? bubbleWidth - 2 * Metrics.bubblePadX : textWidth - Metrics.quoteIndent
        let replyWidth = geometry.bubbles ? bubbleWidth - 2 * Metrics.bubblePadX : textWidth
        let quoted = input.quoted.flatMap { MessageCardText.nonBlank($0.text) == nil ? nil : $0 }
        let hasQuote = quoted != nil
        let budget = MessageCardLayout.maxHeight - 2 * Metrics.padY
        let title = MessageCardText.nonBlank(input.title)
        let date = MessageCardText.nonBlank(input.date)
        let showAuthors = input.showAuthors
        let chrome = Chrome(
            header: title == nil && date == nil ? 0 : (title == nil ? 0 : Metrics.titleLine) + (date == nil ? 0 : Metrics.dateLine) + Metrics.headerGap,
            author: showAuthors ? Metrics.authorLine + Metrics.authorGap : 0,
            bubble: geometry.bubbles ? 2 * Metrics.bubblePadY : 0,
            link: geometry.block
        )

        let sizeAt: (Int) -> Sized = { step in
            let factor = pow(Metrics.shrink, Double(step))
            let replySize = max(Metrics.replyFloor * typeface.replyScale, Metrics.replyStart * typeface.replyScale * factor)
            let quoteSize = max(Metrics.quoteFloor, Metrics.quoteStart * factor)
            let replyFont = MessageCardFont(face: typeface.replyFace, size: replySize)
            let quoteFont = MessageCardFont(face: typeface.quoteFace, size: quoteSize)
            return Sized(
                replySize: replySize,
                quoteSize: quoteSize,
                replyFont: replyFont,
                quoteFont: quoteFont,
                replyLines: MessageCardText.wrap(input.reply.text, maxWidth: replyWidth, font: replyFont, measure: measure),
                quoteLines: quoted.map { MessageCardText.wrap($0.text, maxWidth: quoteWidth, font: quoteFont, measure: measure) } ?? []
            )
        }

        let atFloor: (Sized) -> Bool = { $0.replySize <= Metrics.replyFloor * typeface.replyScale && $0.quoteSize <= Metrics.quoteFloor }
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
        let height = truncated
            ? MessageCardLayout.maxHeight
            : min(MessageCardLayout.maxHeight, max(MessageCardLayout.minHeight, 2 * Metrics.padY + content))

        var painter = Painter(
            width: width,
            // Un texte court flotte au milieu de l'espace libre, jamais collé en haut.
            y: Metrics.padY + max(0, ((height - 2 * Metrics.padY - content) / 2).rounded(.down)),
            showAuthors: showAuthors,
            authorInk: palette.authorInk,
            bubbleWidth: bubbleWidth,
            measure: measure
        )

        var regions: [MessageCardRegion] = []
        let region: (MessageCardPartID, Double, Double) -> Void = { part, top, bottom in
            regions.append(MessageCardRegion(part: part, x: Metrics.padX, y: top, width: textWidth, height: bottom - top))
        }
        let headerTop = painter.y

        if let title {
            let direction = MessageCardText.direction(of: title)
            let font = MessageCardFont(face: .system(800), size: Metrics.titleSize)
            let line = MessageCardText.truncate(MessageCardText.wrap(title, maxWidth: textWidth, font: font, measure: measure), count: 1, maxWidth: textWidth, font: font, measure: measure).first ?? title
            painter.text(line, x: painter.start(rtl: direction == .rtl, inset: 0), baseline: painter.y + Metrics.titleSize, font: font, color: palette.replyInk, direction: direction)
            painter.y += Metrics.titleLine
        }
        if let date {
            let direction = MessageCardText.direction(of: date)
            let font = MessageCardFont(face: .system(500), size: Metrics.dateSize)
            painter.text(date, x: painter.start(rtl: direction == .rtl, inset: 0), baseline: painter.y + Metrics.dateSize, font: font, color: palette.quoteInk, direction: direction)
            painter.y += Metrics.dateLine
        }
        if chrome.header > 0 {
            region(.header, headerTop, painter.y)
            painter.y += Metrics.headerGap
        }

        if let quoted {
            let quote = painter.block(quoted, lines: sized.quoteLines, style: BlockStyle(
                size: sized.quoteSize,
                lineHeight: quoteLineHeight(sized.quoteSize),
                font: sized.quoteFont,
                ink: palette.quoteInk,
                inset: geometry.quoteBar ? Metrics.quoteIndent : 0,
                bubble: geometry.bubbles ? BubbleStyle(offset: 0, color: palette.quotePanel) : nil
            ))
            if geometry.quoteBar {
                painter.ops.append(.bar(MessageCardRectOp(
                    x: quote.rtl ? width - Metrics.padX - Metrics.barWidth : Metrics.padX,
                    y: quote.top,
                    width: Metrics.barWidth,
                    height: painter.y - quote.top,
                    radius: Metrics.barWidth / 2,
                    color: palette.accent
                )))
            }
            region(.quote, quote.top, painter.y)
            painter.ops.append(contentsOf: linkOps(input.template.link, y: painter.y, rtl: quote.rtl, accent: palette.accent, block: geometry.block))
            region(.link, painter.y, painter.y + geometry.block)
            painter.y += geometry.block
        }

        let reply = painter.block(input.reply, lines: sized.replyLines, style: BlockStyle(
            size: sized.replySize,
            lineHeight: replyLineHeight(sized.replySize),
            font: sized.replyFont,
            ink: palette.replyInk,
            inset: 0,
            bubble: geometry.bubbles ? BubbleStyle(offset: Metrics.bubbleOffset, color: palette.replyPanel) : nil
        ))
        region(.reply, reply.top, painter.y)

        return MessageCardLayout(
            width: width,
            height: height,
            ops: painter.ops,
            regions: regions,
            watermark: MessageCardLayout.watermark(handle: input.handle),
            truncated: truncated
        )
    }

    /// Ce que la liaison peint dans son bloc, entre le bas de la citation (`y`) et la réponse.
    private func linkOps(_ link: MessageCardLinkID, y: Double, rtl: Bool, accent: MessageCardColor, block: Double) -> [MessageCardOp] {
        let width = MessageCardLayout.cardWidth
        let edge = rtl ? width - Metrics.padX : Metrics.padX
        let toward: Double = rtl ? -1 : 1
        switch link {
        case .orbite:
            return [.separator(MessageCardSeparatorOp(x1: Metrics.padX, x2: width - Metrics.padX, y: y + block / 2, radius: 11, color: accent, dash: [2, 14], lineWidth: 3))]
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
                text: rtl ? "↲" : "↳", x: edge + toward * Metrics.quoteIndent, y: y + jsRound(block * 0.7),
                font: MessageCardFont(face: .system(700), size: 60),
                color: accent, align: rtl ? .right : .left, direction: .ltr
            ))]
        case .fil:
            let x = rtl ? width - Metrics.padX - Metrics.barWidth / 2 : Metrics.padX + Metrics.barWidth / 2
            return [
                .bar(MessageCardRectOp(x: x - 1.5, y: y + 10, width: 3, height: block - 44, radius: 1.5, color: accent)),
                .dot(MessageCardDotOp(x: x, y: y + block - 26, radius: 10, color: accent)),
            ]
        case .bulles, .silence:
            return []
        }
    }
}

private struct BubbleStyle {
    let offset: Double
    let color: MessageCardColor
}

private struct BlockStyle {
    let size: Double
    let lineHeight: Double
    let font: MessageCardFont
    let ink: MessageCardColor
    let inset: Double
    let bubble: BubbleStyle?
}

/// Le curseur vertical et les opérations accumulées.
private struct Painter {
    let width: Double
    var y: Double
    let showAuthors: Bool
    let authorInk: MessageCardColor
    let bubbleWidth: Double
    let measure: MessageCardMeasure
    var ops: [MessageCardOp] = []

    private static let authorFont = MessageCardFont(face: .system(600), size: Metrics.authorSize)

    func start(rtl: Bool, inset: Double) -> Double {
        rtl ? width - Metrics.padX - inset : Metrics.padX + inset
    }

    mutating func text(_ text: String, x: Double, baseline: Double, font: MessageCardFont, color: MessageCardColor, direction: MessageCardTextDirection) {
        ops.append(.text(MessageCardTextOp(
            text: text, x: x, y: baseline, font: font, color: color,
            align: direction == .rtl ? .right : .left, direction: direction
        )))
    }

    private mutating func author(_ name: String, x: Double, rtl: Bool) {
        guard showAuthors else { return }
        ops.append(.text(MessageCardTextOp(
            text: name, x: x, y: y + Metrics.authorSize, font: Self.authorFont, color: authorInk,
            align: rtl ? .right : .left, direction: MessageCardText.direction(of: name)
        )))
        y += Metrics.authorLine + Metrics.authorGap
    }

    /// Un bloc : son nom, ses lignes — et, pour la liaison « bulles », la bulle qui les porte.
    mutating func block(_ part: MessageCardPart, lines: [String], style: BlockStyle) -> (top: Double, rtl: Bool) {
        let direction = MessageCardText.direction(of: part.text)
        let rtl = direction == .rtl
        let top = y
        let panelIndex = ops.count
        let inset = style.bubble.map { $0.offset + Metrics.bubblePadX } ?? style.inset
        if style.bubble != nil { y += Metrics.bubblePadY }
        author(part.author, x: start(rtl: rtl, inset: inset), rtl: rtl)
        for line in lines {
            text(line, x: start(rtl: rtl, inset: inset), baseline: y + jsRound(style.size), font: style.font, color: style.ink, direction: direction)
            y += style.lineHeight
        }
        if let bubble = style.bubble {
            y += Metrics.bubblePadY
            let x = rtl ? width - Metrics.padX - bubble.offset - bubbleWidth : Metrics.padX + bubble.offset
            ops.insert(.panel(MessageCardRectOp(x: x, y: top, width: bubbleWidth, height: y - top, radius: Metrics.bubbleRadius, color: bubble.color)), at: panelIndex)
        }
        return (top, rtl)
    }
}
