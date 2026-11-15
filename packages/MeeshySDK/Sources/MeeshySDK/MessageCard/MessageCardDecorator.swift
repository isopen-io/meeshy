import Foundation

/// **LE DÉCOR D'UNE MAQUETTE, POSÉ SUR LA CARTE** (#18673) — après la mise en
/// page commune, sans la refaire : le texte se centre, un cadre ou un panneau
/// entoure le contenu, un ornement le signe. Ce qui dépend du CONTENU (panneau,
/// ornement) suit la carte quand elle défile ; ce qui dépend du FORMAT (le
/// cadre) reste fixe sous la fenêtre, comme le fond.
struct MessageCardDecorator {
    let input: MessageCardInput

    static let panelPadding: Double = 56
    static let panelRadius: Double = 44
    static let borderInset: Double = 44
    static let borderWidth: Double = 3
    static let ruleWidth: Double = 120
    static let ruleHeight: Double = 10
    static let quoteMarkSize: Double = 260

    private var palette: MessageCardPalette { input.template.palette.palette }

    func decorated(_ layout: MessageCardLayout) -> MessageCardLayout {
        let decor = input.disposition.decor
        guard !decor.isNone, let bounds = Self.contentBounds(layout.regions) else { return layout }
        let centerX = Self.textColumn(layout.regions).map { $0.x + $0.width / 2 } ?? layout.width / 2
        let content = decor.alignment == .center ? layout.ops.compactMap { centered($0, x: centerX, quote: layout.regions.first { $0.part == .quote }) } : layout.ops
        let viewport = layout.viewportHeight ?? layout.height
        let framed = frameOps(decor.frame, bounds: bounds, width: layout.width, viewport: viewport)
        let behind = tilted(panelOps(decor.frame, bounds: bounds, width: layout.width) + ornamentOps(decor, bounds: bounds, centerX: centerX), bounds: bounds, width: layout.width)
        let scrolls = layout.viewportHeight != nil
        return MessageCardLayout(
            width: layout.width,
            height: layout.height,
            backdrop: layout.backdrop + framed + (scrolls ? [] : behind),
            ops: (scrolls ? behind : []) + content,
            regions: layout.regions,
            watermark: layout.watermark,
            truncated: layout.truncated,
            crowdedByMedia: layout.crowdedByMedia,
            mediaScaleLimit: layout.mediaScaleLimit,
            viewportHeight: layout.viewportHeight
        )
    }

    // MARK: - Alignement

    /// Une ligne qui part du DÉBUT de la colonne se centre ; ce qui est posé à
    /// la fin (l'heure, un crédit) garde sa place. Le filet de la citation, qui
    /// n'a plus de bord où s'appuyer, se retire.
    private func centered(_ op: MessageCardOp, x: Double, quote: MessageCardRegion?) -> MessageCardOp? {
        switch op {
        case let .text(text) where text.rotation == 0 && Self.startsTheLine(text):
            return .text(MessageCardTextOp(text: text.text, x: x, y: text.y, font: text.font, color: text.color, align: .center, direction: text.direction))
        case let .bar(bar) where Self.isQuoteBar(bar, quote: quote):
            return nil
        case let .group(group):
            return .group(MessageCardGroupOp(rotation: group.rotation, cx: group.cx, cy: group.cy,
                                             ops: group.ops.compactMap { centered($0, x: x, quote: quote) }))
        default:
            return op
        }
    }

    private static func startsTheLine(_ text: MessageCardTextOp) -> Bool {
        (text.align == .left && text.direction == .ltr) || (text.align == .right && text.direction == .rtl)
    }

    private static func isQuoteBar(_ bar: MessageCardRectOp, quote: MessageCardRegion?) -> Bool {
        guard let quote, bar.width == MessageCardMetrics.barWidth else { return false }
        return abs(bar.x - quote.x) < 1 || abs(bar.x + bar.width - (quote.x + quote.width)) < 1
    }

    // MARK: - Cadre, panneau, ornement

    private func frameOps(_ frame: MessageCardDecor.Frame, bounds: Bounds, width: Double, viewport: Double) -> [MessageCardOp] {
        guard frame == .border else { return [] }
        let inset = Self.borderInset
        let line = Self.borderWidth
        let ink = palette.accent.withAlpha(0.55)
        let edges = [
            MessageCardRectOp(x: inset, y: inset, width: width - 2 * inset, height: line, radius: 0, color: ink),
            MessageCardRectOp(x: inset, y: viewport - inset - line, width: width - 2 * inset, height: line, radius: 0, color: ink),
            MessageCardRectOp(x: inset, y: inset, width: line, height: viewport - 2 * inset, radius: 0, color: ink),
            MessageCardRectOp(x: width - inset - line, y: inset, width: line, height: viewport - 2 * inset, radius: 0, color: ink),
        ]
        return edges.map(MessageCardOp.bar)
    }

    private func panelOps(_ frame: MessageCardDecor.Frame, bounds: Bounds, width: Double) -> [MessageCardOp] {
        guard frame == .panel else { return [] }
        let pad = Self.panelPadding
        let left = max(24, bounds.minX - pad)
        let right = min(width - 24, bounds.maxX + pad)
        let color = palette.tone == .dark ? MessageCardColor.rgba(255, 255, 255, 0.08) : MessageCardColor.rgba(255, 255, 255, 0.62)
        return [.panel(MessageCardRectOp(x: left, y: bounds.minY - pad, width: right - left, height: bounds.maxY - bounds.minY + 2 * pad,
                                         radius: Self.panelRadius, color: color))]
    }

    private func ornamentOps(_ decor: MessageCardDecor, bounds: Bounds, centerX: Double) -> [MessageCardOp] {
        let centered = decor.alignment == .center
        switch decor.ornament {
        case .none:
            return []
        case .accentRule:
            let x = centered ? centerX - Self.ruleWidth / 2 : bounds.minX
            return [.bar(MessageCardRectOp(x: x, y: max(24, bounds.minY - 64), width: Self.ruleWidth, height: Self.ruleHeight,
                                           radius: Self.ruleHeight / 2, color: palette.accent))]
        case .quoteMark:
            let font = MessageCardFont(face: MessageCardTemplates.guillemetFace, size: Self.quoteMarkSize)
            return [.text(MessageCardTextOp(text: "“", x: centered ? centerX : bounds.minX - 24, y: bounds.minY + Self.quoteMarkSize * 0.55,
                                            font: font, color: palette.accent.withAlpha(0.28), align: centered ? .center : .left, direction: .ltr))]
        }
    }

    /// Une carte inclinée emporte son panneau et son ornement avec elle.
    private func tilted(_ ops: [MessageCardOp], bounds: Bounds, width: Double) -> [MessageCardOp] {
        let tilt = input.disposition.tilt.radians
        guard tilt != 0, !ops.isEmpty else { return ops }
        return [.group(MessageCardGroupOp(rotation: tilt, cx: width / 2, cy: (bounds.minY + bounds.maxY) / 2, ops: ops))]
    }

    // MARK: - Géométrie

    struct Bounds: Equatable {
        let minX: Double
        let minY: Double
        let maxX: Double
        let maxY: Double
    }

    /// Ce que le contenu occupe — l'en-tête compris, le fond jamais.
    static func contentBounds(_ regions: [MessageCardRegion]) -> Bounds? {
        let parts = regions.filter { $0.part != .background && $0.height > 0 }
        guard !parts.isEmpty else { return nil }
        return Bounds(
            minX: parts.map(\.x).min() ?? 0,
            minY: parts.map(\.y).min() ?? 0,
            maxX: parts.map { $0.x + $0.width }.max() ?? 0,
            maxY: parts.map { $0.y + $0.height }.max() ?? 0
        )
    }

    /// La colonne du texte : celle de la réponse, sinon de la citation.
    static func textColumn(_ regions: [MessageCardRegion]) -> MessageCardRegion? {
        regions.first { $0.part == .reply } ?? regions.first { $0.part == .quote }
    }
}

extension MessageCardColor {
    func withAlpha(_ value: Double) -> MessageCardColor {
        MessageCardColor(red: red, green: green, blue: blue, alpha: alpha * value)
    }
}
