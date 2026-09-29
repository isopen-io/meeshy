import Foundation
import UIKit
import MeeshySDK

/// **LA PEINTURE D'UNE CARTE D'EXPORT** — la moitié impure de
/// `MessageCardLayout` (miroir de `apps/web/src/lib/export/message-card-paint.ts`) :
/// elle mesure avec les vraies polices, peint en 1080 px de large et rend un
/// PNG signé Meeshy dans ses métadonnées (`MessageCardPNGMetadata`).
///
/// `nonisolated` : la peinture d'une carte story (1080 × 1920) ne doit jamais
/// tenir le MainActor — l'appelant la lance détachée, et le composer reste
/// fluide pendant qu'on change de template.
public nonisolated struct MessageCardImage: Sendable {
    public let png: Data
    public let width: Int
    public let height: Int
    public let truncated: Bool
}

public nonisolated enum MessageCardRenderer {

    public static func render(_ input: MessageCardInput, metadata: MessageCardPNGMetadata = .meeshy) -> MessageCardImage? {
        let fonts = FontBook()
        let layout = MessageCardLayout.make(input) { text, font in
            Double((text as NSString).size(withAttributes: [.font: fonts.font(font)]).width)
        }
        let size = CGSize(width: layout.width, height: layout.height)
        let format = UIGraphicsImageRendererFormat()
        format.scale = 1
        format.opaque = true
        let palette = input.template.palette.palette
        let png = UIGraphicsImageRenderer(size: size, format: format).pngData { context in
            let cg = context.cgContext
            paintBackground(cg, size: size, palette: palette)
            paintWatermark(cg, size: size, text: layout.watermark, palette: palette, fonts: fonts)
            for op in layout.ops { paint(op, in: cg, fonts: fonts) }
        }
        guard !png.isEmpty else { return nil }
        return MessageCardImage(png: metadata.stamp(png), width: Int(layout.width), height: Int(layout.height), truncated: layout.truncated)
    }

    // MARK: - Fonts

    /// Les polices d'un rendu, résolues une fois chacune.
    private nonisolated final class FontBook {
        private var cache: [MessageCardFont: UIFont] = [:]

        func font(_ font: MessageCardFont) -> UIFont {
            if let cached = cache[font] { return cached }
            let resolved = MessageCardRenderer.uiFont(font)
            cache[font] = resolved
            return resolved
        }
    }

    public static func uiFont(_ font: MessageCardFont) -> UIFont {
        let size = CGFloat(font.size)
        switch font.face {
        case let .native(weight, italic):
            let base = UIFont.systemFont(ofSize: size, weight: uiWeight(weight))
            guard italic, let descriptor = base.fontDescriptor.withSymbolicTraits(.traitItalic) else { return base }
            return UIFont(descriptor: descriptor, size: size)
        case let .story(style):
            if let name = style.fontName, let custom = UIFont(name: name, size: size) { return custom }
            return UIFont.systemFont(ofSize: size, weight: .bold)
        }
    }

    private static func uiWeight(_ weight: Int) -> UIFont.Weight {
        switch weight {
        case ..<350: return .light
        case ..<450: return .regular
        case ..<550: return .medium
        case ..<650: return .semibold
        case ..<750: return .bold
        case ..<850: return .heavy
        default: return .black
        }
    }

    // MARK: - Paint

    private static func uiColor(_ color: MessageCardColor, alpha: Double = 1) -> UIColor {
        UIColor(red: CGFloat(color.red), green: CGFloat(color.green), blue: CGFloat(color.blue), alpha: CGFloat(color.alpha * alpha))
    }

    private static func paintBackground(_ cg: CGContext, size: CGSize, palette: MessageCardPalette) {
        let space = CGColorSpaceCreateDeviceRGB()
        let colors = palette.background.map { uiColor($0.color).cgColor } as CFArray
        let locations = palette.background.map { CGFloat($0.offset) }
        if let gradient = CGGradient(colorsSpace: space, colors: colors, locations: locations) {
            cg.drawLinearGradient(
                gradient,
                start: .zero,
                end: CGPoint(x: size.width * 0.35, y: size.height),
                options: [.drawsBeforeStartLocation, .drawsAfterEndLocation]
            )
        }
        guard let glow = palette.glow else { return }
        let glowColors = [uiColor(glow).cgColor, uiColor(.transparent).cgColor] as CFArray
        if let gradient = CGGradient(colorsSpace: space, colors: glowColors, locations: [0, 1]) {
            let center = CGPoint(x: size.width * 0.85, y: size.height * 0.12)
            cg.drawRadialGradient(gradient, startCenter: center, startRadius: 0, endCenter: center, endRadius: size.width * 0.9, options: [])
        }
    }

    /// Le filigrane : « Meeshy @pseudo », en diagonale, répété sur toute la carte.
    private static func paintWatermark(_ cg: CGContext, size: CGSize, text: String, palette: MessageCardPalette, fonts: FontBook) {
        let font = fonts.font(MessageCardFont(face: .system(700), size: 34))
        let attributes: [NSAttributedString.Key: Any] = [.font: font, .foregroundColor: uiColor(palette.watermarkInk, alpha: palette.watermarkAlpha)]
        let step = Double(("\(text)    " as NSString).size(withAttributes: attributes).width)
        guard step > 0 else { return }
        let half = Double(font.lineHeight) / 2
        let span = hypot(Double(size.width), Double(size.height))
        cg.saveGState()
        cg.translateBy(x: size.width / 2, y: size.height / 2)
        cg.rotate(by: -CGFloat.pi / 7)
        var row = -span / 2
        while row < span / 2 {
            let shift = (row / 150).truncatingRemainder(dividingBy: 2) * (step / 2)
            var x = -span / 2 - step + shift
            while x < span / 2 {
                (text as NSString).draw(at: CGPoint(x: x, y: row - half), withAttributes: attributes)
                x += step
            }
            row += 150
        }
        cg.restoreGState()
    }

    private static func paint(_ op: MessageCardOp, in cg: CGContext, fonts: FontBook) {
        switch op {
        case let .text(text):
            let font = fonts.font(text.font)
            let attributes: [NSAttributedString.Key: Any] = [.font: font, .foregroundColor: uiColor(text.color)]
            let string = text.text as NSString
            let width = Double(string.size(withAttributes: attributes).width)
            let left: Double
            switch text.align {
            case .left: left = text.x
            case .right: left = text.x - width
            case .center: left = text.x - width / 2
            }
            string.draw(at: CGPoint(x: left, y: text.y - Double(font.ascender)), withAttributes: attributes)
        case let .bar(rect), let .panel(rect):
            cg.setFillColor(uiColor(rect.color).cgColor)
            let frame = CGRect(x: rect.x, y: rect.y, width: rect.width, height: rect.height)
            let radius = min(CGFloat(rect.radius), frame.width / 2, frame.height / 2)
            let corner = max(0, radius)
            cg.addPath(CGPath(roundedRect: frame, cornerWidth: corner, cornerHeight: corner, transform: nil))
            cg.fillPath()
        case let .dot(dot):
            cg.setFillColor(uiColor(dot.color).cgColor)
            cg.fillEllipse(in: CGRect(x: dot.x - dot.radius, y: dot.y - dot.radius, width: dot.radius * 2, height: dot.radius * 2))
        case let .separator(separator):
            paintSeparator(separator, in: cg)
        }
    }

    private static func paintSeparator(_ op: MessageCardSeparatorOp, in cg: CGContext) {
        cg.saveGState()
        cg.setStrokeColor(uiColor(op.color).cgColor)
        cg.setLineWidth(CGFloat(op.lineWidth))
        cg.setLineCap(.round)
        cg.setLineDash(phase: 0, lengths: op.dash.map { CGFloat($0) })
        let middle = (op.x1 + op.x2) / 2
        if op.radius == 0 {
            cg.move(to: CGPoint(x: op.x1, y: op.y))
            cg.addLine(to: CGPoint(x: op.x2, y: op.y))
            cg.strokePath()
            cg.restoreGState()
            return
        }
        cg.move(to: CGPoint(x: op.x1, y: op.y))
        cg.addLine(to: CGPoint(x: middle - op.radius - 18, y: op.y))
        cg.move(to: CGPoint(x: middle + op.radius + 18, y: op.y))
        cg.addLine(to: CGPoint(x: op.x2, y: op.y))
        cg.strokePath()
        cg.setLineDash(phase: 0, lengths: [])
        cg.strokeEllipse(in: CGRect(x: middle - op.radius, y: op.y - op.radius, width: op.radius * 2, height: op.radius * 2))
        cg.restoreGState()
    }
}
