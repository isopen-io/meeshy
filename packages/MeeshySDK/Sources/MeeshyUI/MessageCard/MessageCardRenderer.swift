import Foundation
import UIKit
import MeeshySDK

/// **LA PEINTURE D'UNE CARTE D'EXPORT** — la moitié impure de
/// `MessageCardLayout` (miroir de `apps/web/src/lib/export/message-card-paint.ts`) :
/// elle mesure avec les vraies polices, peint en 1080 px de large (1920 en
/// paysage) et rend un PNG signé Meeshy dans ses métadonnées (`MessageCardPNGMetadata`).
///
/// UN SEUL MOTEUR pour l'image exportée, les vignettes et chaque image d'une
/// carte animée (#8692) : les trois passent par `paint`. La vignette ne
/// diffère que par l'échelle — et par des traits portés à une épaisseur
/// LISIBLE (`MessageCardLayout.legible`), sans quoi le séparateur disparaissait.
///
/// `nonisolated` : la peinture d'une carte story (1080 × 1920) ne doit jamais
/// tenir le MainActor — l'appelant la lance détachée, et le composer reste
/// fluide pendant qu'on change de template.
public nonisolated struct MessageCardImage: Sendable {
    public let png: Data
    public let width: Int
    public let height: Int
    public let truncated: Bool
    /// Les zones touchables de la carte, en pixels de la carte — l'aperçu les pose sur l'image.
    public let regions: [MessageCardRegion]
}

/// Les pixels des médias d'une carte, par identifiant de média — chargés par
/// l'application, jamais par la loi. Immuables une fois remis.
public nonisolated struct MessageCardPictures: @unchecked Sendable {
    public let images: [String: CGImage]

    public init(_ images: [String: CGImage] = [:]) {
        self.images = images
    }

    public static let none = MessageCardPictures()

    public func replacing(_ id: String, with image: CGImage?) -> MessageCardPictures {
        var next = images
        next[id] = image
        return MessageCardPictures(next)
    }
}

public nonisolated enum MessageCardRenderer {

    public static func render(_ input: MessageCardInput, pictures: MessageCardPictures = .none, metadata: MessageCardPNGMetadata = .meeshy) -> MessageCardImage? {
        let fonts = FontBook()
        let layout = layout(input, fonts: fonts)
        let png = renderer(CGSize(width: layout.width, height: layout.height), scale: 1).pngData { context in
            paint(layout, input: input, pictures: pictures, in: context.cgContext, fonts: fonts)
        }
        guard !png.isEmpty else { return nil }
        return MessageCardImage(
            png: metadata.stamp(png),
            width: Int(layout.width),
            height: Int(layout.height),
            truncated: layout.truncated,
            regions: layout.regions
        )
    }

    /// La VIGNETTE d'un template pour la galerie : la même carte, peinte à `width`
    /// points de large — sans métadonnées, elle ne quitte jamais l'appareil.
    public static func thumbnail(_ input: MessageCardInput, width: Double, displayScale: Double = 2, pictures: MessageCardPictures = .none) -> UIImage? {
        let fonts = FontBook()
        let full = layout(input, fonts: fonts)
        let scale = width / full.width
        let layout = full.legible(atScale: scale)
        let format = UIGraphicsImageRendererFormat()
        format.scale = CGFloat(displayScale)
        format.opaque = true
        let size = CGSize(width: layout.width * scale, height: layout.height * scale)
        return UIGraphicsImageRenderer(size: size, format: format).image { context in
            context.cgContext.scaleBy(x: CGFloat(scale), y: CGFloat(scale))
            paint(layout, input: input, pictures: pictures, in: context.cgContext, fonts: fonts)
        }
    }

    /// Une IMAGE d'une carte animée, à la taille en pixels du plan (#8692).
    public static func frame(_ input: MessageCardInput, pictures: MessageCardPictures, pixelWidth: Int, pixelHeight: Int) -> CGImage? {
        let fonts = FontBook()
        let layout = layout(input, fonts: fonts)
        let sx = Double(pixelWidth) / layout.width
        let sy = Double(pixelHeight) / layout.height
        return renderer(CGSize(width: pixelWidth, height: pixelHeight), scale: 1).image { context in
            context.cgContext.scaleBy(x: CGFloat(sx), y: CGFloat(sy))
            paint(layout, input: input, pictures: pictures, in: context.cgContext, fonts: fonts)
        }.cgImage
    }

    /// La taille de la carte, sans la peindre — le plan d'une animation en a besoin d'abord.
    public static func size(of input: MessageCardInput) -> CGSize {
        let layout = layout(input, fonts: FontBook())
        return CGSize(width: layout.width, height: layout.height)
    }

    private static func layout(_ input: MessageCardInput, fonts: FontBook) -> MessageCardLayout {
        MessageCardLayout.make(input) { text, font in
            Double((text as NSString).size(withAttributes: [.font: fonts.font(font)]).width)
        }
    }

    private static func renderer(_ size: CGSize, scale: CGFloat) -> UIGraphicsImageRenderer {
        let format = UIGraphicsImageRendererFormat()
        format.scale = scale
        format.opaque = true
        return UIGraphicsImageRenderer(size: size, format: format)
    }

    private static func paint(_ layout: MessageCardLayout, input: MessageCardInput, pictures: MessageCardPictures, in cg: CGContext, fonts: FontBook) {
        let size = CGSize(width: layout.width, height: layout.height)
        let palette = input.template.palette.palette
        paintBackground(cg, size: size, palette: palette)
        for op in layout.backdrop { paint(op, pictures: pictures, in: cg, fonts: fonts) }
        paintWatermark(cg, size: size, text: layout.watermark, palette: palette, fonts: fonts)
        for op in layout.ops { paint(op, pictures: pictures, in: cg, fonts: fonts) }
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

    private static func paint(_ op: MessageCardOp, pictures: MessageCardPictures, in cg: CGContext, fonts: FontBook) {
        switch op {
        case let .text(text):
            paintText(text, in: cg, fonts: fonts)
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
        case let .media(media):
            paintMedia(media, image: pictures.images[media.mediaID], in: cg)
        case let .glyph(glyph):
            paintGlyph(glyph, in: cg)
        case let .group(group):
            cg.saveGState()
            cg.translateBy(x: group.cx, y: group.cy)
            cg.rotate(by: CGFloat(group.rotation))
            cg.translateBy(x: -group.cx, y: -group.cy)
            for child in group.ops { paint(child, pictures: pictures, in: cg, fonts: fonts) }
            cg.restoreGState()
        }
    }

    private static func paintText(_ text: MessageCardTextOp, in cg: CGContext, fonts: FontBook) {
        let font = fonts.font(text.font)
        let attributes: [NSAttributedString.Key: Any] = [.font: font, .foregroundColor: uiColor(text.color)]
        let string = text.text as NSString
        let width = Double(string.size(withAttributes: attributes).width)
        let offset: Double
        switch text.align {
        case .left: offset = 0
        case .right: offset = -width
        case .center: offset = -width / 2
        }
        guard text.rotation != 0 else {
            string.draw(at: CGPoint(x: text.x + offset, y: text.y - Double(font.ascender)), withAttributes: attributes)
            return
        }
        // Couché : (x, y) est le départ de la ligne médiane des capitales.
        cg.saveGState()
        cg.translateBy(x: text.x, y: text.y)
        cg.rotate(by: CGFloat(text.rotation))
        string.draw(at: CGPoint(x: offset, y: Double(font.capHeight / 2 - font.ascender)), withAttributes: attributes)
        cg.restoreGState()
    }

    /// Un média REMPLIT son cadre (recadré au centre) ; sans pixels, la couleur d'attente.
    private static func paintMedia(_ op: MessageCardMediaOp, image: CGImage?, in cg: CGContext) {
        let frame = CGRect(x: op.x, y: op.y, width: op.width, height: op.height)
        let corner = max(0, min(CGFloat(op.radius), frame.width / 2, frame.height / 2))
        cg.saveGState()
        cg.addPath(CGPath(roundedRect: frame, cornerWidth: corner, cornerHeight: corner, transform: nil))
        cg.clip()
        if let image, image.width > 0, image.height > 0 {
            let pixels = CGSize(width: image.width, height: image.height)
            let scale = max(frame.width / pixels.width, frame.height / pixels.height)
            let drawn = CGSize(width: pixels.width * scale, height: pixels.height * scale)
            UIImage(cgImage: image).draw(in: CGRect(
                x: frame.midX - drawn.width / 2, y: frame.midY - drawn.height / 2,
                width: drawn.width, height: drawn.height
            ))
        } else {
            cg.setFillColor(uiColor(op.placeholder).cgColor)
            cg.fill(frame)
        }
        cg.restoreGState()
    }

    private static func paintGlyph(_ op: MessageCardGlyphOp, in cg: CGContext) {
        let s = CGFloat(op.size)
        let cx = CGFloat(op.x)
        let cy = CGFloat(op.y)
        cg.saveGState()
        cg.setFillColor(uiColor(op.color).cgColor)
        switch op.glyph {
        case .play:
            cg.move(to: CGPoint(x: cx - s * 0.32, y: cy - s * 0.45))
            cg.addLine(to: CGPoint(x: cx - s * 0.32, y: cy + s * 0.45))
            cg.addLine(to: CGPoint(x: cx + s * 0.48, y: cy))
            cg.closePath()
            cg.fillPath()
        case .note:
            cg.fillEllipse(in: CGRect(x: cx - s * 0.42, y: cy + s * 0.1, width: s * 0.44, height: s * 0.34))
            cg.fill(CGRect(x: cx - s * 0.04, y: cy - s * 0.46, width: s * 0.09, height: s * 0.74))
            cg.move(to: CGPoint(x: cx + s * 0.05, y: cy - s * 0.46))
            cg.addQuadCurve(to: CGPoint(x: cx + s * 0.4, y: cy - s * 0.08), control: CGPoint(x: cx + s * 0.42, y: cy - s * 0.34))
            cg.addLine(to: CGPoint(x: cx + s * 0.05, y: cy - s * 0.24))
            cg.closePath()
            cg.fillPath()
        }
        cg.restoreGState()
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
