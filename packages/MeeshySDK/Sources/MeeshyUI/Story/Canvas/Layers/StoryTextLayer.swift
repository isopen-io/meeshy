import Foundation
import QuartzCore
import CoreText
import UIKit
import MeeshySDK

/// `CATextLayer` subclass that renders a `StoryTextObject` with crisp
/// design-pixel typography across all device sizes.
///
/// `fontSize` is interpreted in design-space pixels (1080-référentiel) and is
/// scaled through `CanvasGeometry.render(_:)` so two devices of different
/// physical size show typography at identical visual proportions.
public final class StoryTextLayer: CATextLayer, @unchecked Sendable {
    public private(set) nonisolated(unsafe) var textObject: StoryTextObject?

    public override nonisolated init() { super.init() }
    public override nonisolated init(layer: Any) { super.init(layer: layer) }

    @available(*, unavailable)
    public required nonisolated init?(coder: NSCoder) {
        fatalError("StoryTextLayer does not support NSCoder")
    }

    @MainActor
    public func configure(with text: StoryTextObject,
                          geometry: CanvasGeometry,
                          mode: RenderMode) {
        self.textObject = text

        // Cross-device parity invariant: every render-space dimension MUST be a
        // linear function of `geometry.scaleFactor`. Therefore we measure the
        // text bounding box at the DESIGN font size and project the whole
        // bounding box through `geometry.render(_:)` once. If we measured in
        // render space (e.g. `attributed.size()` at the rendered font), font
        // hinting + sub-pixel rounding would break the iPhone↔iPad linearity
        // contract enforced by `CrossDeviceEquivalenceTests`.
        let designFontSize = CGFloat(text.fontSize * text.scale)
        let designFont = resolveFont(family: text.fontFamily, size: designFontSize)
        let color = parseHexColor(text.textColor) ?? UIColor.white

        let alignment = parseAlignment(text.textAlign)
        let para = NSMutableParagraphStyle()
        para.alignment = alignment
        para.baseWritingDirection = .natural   // RTL auto-detect for Arabic/Hebrew

        // Measure in design space.
        let designAttr = NSAttributedString(string: text.text, attributes: [
            .font: designFont,
            .foregroundColor: color.cgColor,
            .paragraphStyle: para
        ])
        let designSize = designAttr.size()
        // Symmetric pad in design pixels (16 design px ≈ ~6 px on iPhone, ~12 on iPad).
        let designBounds = CGSize(width: ceil(designSize.width) + 16,
                                  height: ceil(designSize.height) + 16)

        // Render-space bounds is the linear projection of the design bounds.
        let renderedBounds = geometry.render(designBounds)
        bounds = CGRect(origin: .zero, size: renderedBounds)

        // Render-space font for actual painting.
        let renderedFontSize = geometry.render(designFontSize)
        let renderedFont = resolveFont(family: text.fontFamily, size: renderedFontSize)
        let renderedAttr = NSAttributedString(string: text.text, attributes: [
            .font: renderedFont,
            .foregroundColor: color.cgColor,
            .paragraphStyle: para
        ])
        string = renderedAttr
        // Mirror the rendered font size on the CATextLayer property so callers
        // (and tests) can read it directly without unwrapping the attributed string.
        fontSize = renderedFontSize
        alignmentMode = caTextAlignment(from: alignment)
        contentsScale = UIScreen.main.scale
        isWrapped = true
        truncationMode = .end

        let designCenterX = geometry.designLength(forNormalized: CGFloat(text.x))
        let designCenterY = CGFloat(text.y) * CanvasGeometry.designHeight
        position = geometry.render(CGPoint(x: designCenterX, y: designCenterY))
        anchorPoint = text.anchor
        transform = CATransform3DMakeRotation(CGFloat(text.rotation) * .pi / 180, 0, 0, 1)
        zPosition = CGFloat(text.zIndex)
        name = text.id

        // Static text is a rasterization candidate during playback.
        shouldRasterize = mode == .play && text.isStatic
        if shouldRasterize { rasterizationScale = UIScreen.main.scale }
    }

    // MARK: - Helpers

    @MainActor
    private func resolveFont(family: String, size: CGFloat) -> UIFont {
        if family == "system" {
            return UIFont.systemFont(ofSize: size, weight: .semibold)
        }
        if let custom = UIFont(name: family, size: size) {
            return custom
        }
        return UIFont.systemFont(ofSize: size, weight: .semibold)
    }

    private nonisolated func parseAlignment(_ raw: String?) -> NSTextAlignment {
        // RTL behavior: when the user explicitly picks "left" or "right", that
        // wins. Otherwise default to .natural so Arabic/Hebrew text is naturally
        // right-aligned and Latin/Cyrillic stays left/centered.
        switch raw?.lowercased() {
        case "left":   return .left
        case "right":  return .right
        case "center": return .center
        case "natural", nil: return .natural
        default:       return .natural
        }
    }

    private nonisolated func caTextAlignment(from alignment: NSTextAlignment) -> CATextLayerAlignmentMode {
        // CATextLayer has no .natural — pick a sensible projection. Real BiDi
        // resolution lives in NSAttributedString's baseWritingDirection, so
        // CATextLayer alignment is mostly cosmetic for our wrapped lines.
        switch alignment {
        case .left:    return .left
        case .right:   return .right
        case .justified: return .justified
        case .natural, .center: return .center
        @unknown default: return .center
        }
    }

    @MainActor
    private func parseHexColor(_ hex: String?) -> UIColor? {
        guard let hex else { return nil }
        var trimmed = hex.trimmingCharacters(in: .whitespacesAndNewlines)
        if trimmed.hasPrefix("#") { trimmed.removeFirst() }
        guard trimmed.count == 6 || trimmed.count == 8 else { return nil }
        var rgb: UInt64 = 0
        guard Scanner(string: trimmed).scanHexInt64(&rgb) else { return nil }
        let r, g, b, a: CGFloat
        if trimmed.count == 8 {
            r = CGFloat((rgb & 0xFF000000) >> 24) / 255
            g = CGFloat((rgb & 0x00FF0000) >> 16) / 255
            b = CGFloat((rgb & 0x0000FF00) >> 8) / 255
            a = CGFloat(rgb & 0x000000FF) / 255
        } else {
            r = CGFloat((rgb & 0xFF0000) >> 16) / 255
            g = CGFloat((rgb & 0x00FF00) >> 8) / 255
            b = CGFloat(rgb & 0x0000FF) / 255
            a = 1.0
        }
        return UIColor(red: r, green: g, blue: b, alpha: a)
    }
}
