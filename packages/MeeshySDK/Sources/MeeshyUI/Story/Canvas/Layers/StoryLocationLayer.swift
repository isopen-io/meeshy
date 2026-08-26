import Foundation
import QuartzCore
import UIKit
import MeeshySDK

/// `CALayer` subclass that renders a `StoryLocationObject` as a rasterized
/// pill badge (pin glyph + place label), the same "pre-rasterized image
/// assigned to `contents`" pattern `StoryStickerLayer` uses for emoji — a
/// single opaque asset is far cheaper to composite/cache than a live
/// sublayer tree, and it survives `layer.render(in:)` (canvas snapshot,
/// backdrop capture, AVFoundation export) exactly like every other item.
///
/// Design-space metrics are measured once then projected through
/// `CanvasGeometry.render(_:)`, the same measure→project pipeline
/// `StoryTextLayer.configure` uses for `x`/`y`/`anchor`/`rotation` — this is
/// what keeps the badge at the SAME canvas position on iPhone, iPad, and in
/// the exported video (see `StoryRenderer` doc: single source of truth for
/// the first-plane composite).
public final class StoryLocationLayer: CALayer {
    // iOS 26.1 : deinit synthétisée ISOLÉE (SE-0466, isolation MainActor par
    // défaut) → double-free `pointer being freed was not allocated` (abrt)
    // au démontage hors d'une tâche (test XCTest synchrone, vue démontée).
    // Garde : MainActorDeinitSourceGuardTests / MeeshyUIDeinitSourceGuardTests.
    nonisolated deinit {}
    public private(set) nonisolated(unsafe) var locationObject: StoryLocationObject?

    /// Design-px font size before `location.scale` — a location badge has no
    /// author-adjustable `fontSize` field (unlike `StoryTextObject`), so the
    /// base size is a fixed system-badge constant.
    private static let baseDesignFontSize: CGFloat = 42
    private static let horizontalPad: CGFloat = 22
    private static let verticalPad: CGFloat = 14
    private static let iconGap: CGFloat = 10

    /// Palette de marque MeeshyColors — jamais de couleur système en dur
    /// (`packages/MeeshySDK/CLAUDE.md`, Visual Identity). Réutilise le
    /// parseur hex déjà employé par `StoryTextLayer` pour brancher les
    /// tokens `MeeshyColors` (déclarés en `Color`, pas en `UIColor`) sur ce
    /// rendu `UIGraphicsImageRenderer`.
    static let pinTintColor: UIColor =
        StoryTextLayer.parseHexColorNonisolated(MeeshyColors.errorHex) ?? .systemRed
    static let labelTextColor: UIColor =
        StoryTextLayer.parseHexColorNonisolated(MeeshyColors.indigo900Hex) ?? .black
    static let pillBackgroundColor: UIColor =
        (StoryTextLayer.parseHexColorNonisolated(MeeshyColors.indigo50Hex) ?? .white)
            .withAlphaComponent(0.94)

    public override nonisolated init() { super.init() }
    public override nonisolated init(layer: Any) { super.init(layer: layer) }

    @available(*, unavailable)
    public required nonisolated init?(coder: NSCoder) {
        fatalError("StoryLocationLayer does not support NSCoder")
    }

    @MainActor
    public func configure(with location: StoryLocationObject,
                          geometry: CanvasGeometry,
                          mode: RenderMode,
                          renderScale: CGFloat = UIScreen.main.scale) {
        self.locationObject = location

        let label = Self.resolvedLabel(for: location.place)
        let designFontSize = Self.baseDesignFontSize * CGFloat(location.scale)
        let renderedFontSize = geometry.render(designFontSize)
        let renderedHPad = geometry.render(Self.horizontalPad * CGFloat(location.scale))
        let renderedVPad = geometry.render(Self.verticalPad * CGFloat(location.scale))
        let renderedGap = geometry.render(Self.iconGap * CGFloat(location.scale))
        let scale = contentsScale

        let (image, renderedSize) = Self.badgeImage(label: label,
                                                     fontSize: renderedFontSize,
                                                     hPad: renderedHPad,
                                                     vPad: renderedVPad,
                                                     gap: renderedGap,
                                                     screenScale: scale)
        contents = image?.cgImage
        contentsScale = scale
        bounds = CGRect(origin: .zero, size: renderedSize)

        let designCenterX = geometry.designLength(forNormalized: CGFloat(location.x))
        let designCenterY = geometry.designHeightLength(forNormalized: CGFloat(location.y))
        position = geometry.render(CGPoint(x: designCenterX, y: designCenterY))
        anchorPoint = location.anchor
        transform = CATransform3DMakeRotation(CGFloat(location.rotation) * .pi / 180, 0, 0, 1)
        zPosition = CGFloat(location.zIndex)
        name = location.id

        // A location badge has no timing/keyframe channel (RenderableItem
        // timing fields are all nil, see `StoryRenderer` conformance) — it
        // never changes mid-slide, so it's a safe `.play` rasterization
        // candidate, same as static text/stickers.
        shouldRasterize = mode == .play && location.isStatic
        if shouldRasterize { rasterizationScale = scale }
    }

    /// `place.name`, else `place.address`, else the localized "Ici" —
    /// NEVER blank: an unnamed pin dropped by hand still needs a label.
    /// Stays `@MainActor` (MeeshyUI's default isolation) because
    /// `Bundle.module` is itself MainActor-isolated in this target — unlike
    /// `StoryTextLayer.parseHexColorNonisolated`, which touches no bundle.
    @MainActor
    public static func resolvedLabel(for place: SharedPlace) -> String {
        if let name = place.name, !name.isEmpty { return name }
        if let address = place.address, !address.isEmpty { return address }
        return String(localized: "story.location.here", defaultValue: "Ici", bundle: .module)
    }

    /// Cadre du badge dans l'espace CANVAS (boîte englobante, rotation
    /// ignorée) — pensé pour le hit-test du reader : la couche de tap de
    /// l'app doit tomber EXACTEMENT là où `configure` dessine, d'où le
    /// partage strict des mêmes constantes, de la même mesure
    /// (`measuredBadgeSize`) et des mêmes projections `CanvasGeometry`.
    @MainActor
    public static func badgeFrame(for location: StoryLocationObject,
                                  canvasSize: CGSize) -> CGRect {
        let geometry = CanvasGeometry(renderSize: canvasSize)
        let label = resolvedLabel(for: location.place)
        let size = measuredBadgeSize(
            label: label,
            fontSize: geometry.render(baseDesignFontSize * CGFloat(location.scale)),
            hPad: geometry.render(horizontalPad * CGFloat(location.scale)),
            vPad: geometry.render(verticalPad * CGFloat(location.scale)),
            gap: geometry.render(iconGap * CGFloat(location.scale))
        )
        let designCenterX = geometry.designLength(forNormalized: CGFloat(location.x))
        let designCenterY = geometry.designHeightLength(forNormalized: CGFloat(location.y))
        let center = geometry.render(CGPoint(x: designCenterX, y: designCenterY))
        return CGRect(x: center.x - size.width * location.anchor.x,
                      y: center.y - size.height * location.anchor.y,
                      width: size.width,
                      height: size.height)
    }

    /// Rasterizes the pill badge (`pillBackgroundColor` pill, `pinTintColor`
    /// pin glyph, `labelTextColor` label — all three MeeshyColors, never a
    /// hardcoded system color) at render-space size. Returns `nil` image
    /// only if `UIGraphicsImageRenderer`
    /// itself fails to produce a backing store (never observed in practice) —
    /// callers must still assign the `renderedSize` so `bounds`/hit-testing
    /// stay correct even in that degenerate case.
    /// Mesure du badge SANS rasterisation — partagée entre `badgeImage`
    /// (rendu) et `badgeFrame` (hit-test reader) pour qu'aucun des deux ne
    /// puisse dériver de l'autre.
    @MainActor
    static func measuredBadgeSize(label: String,
                                  fontSize: CGFloat,
                                  hPad: CGFloat,
                                  vPad: CGFloat,
                                  gap: CGFloat) -> CGSize {
        let font = UIFont.systemFont(ofSize: fontSize, weight: .semibold)
        let textAttrs: [NSAttributedString.Key: Any] = [.font: font, .foregroundColor: labelTextColor]
        let textSize = (label as NSString).size(withAttributes: textAttrs)
        let iconSize = fontSize
        return CGSize(
            width: ceil(hPad * 2 + iconSize + gap + textSize.width),
            height: ceil(vPad * 2 + max(iconSize, textSize.height))
        )
    }

    @MainActor
    private static func badgeImage(label: String,
                                   fontSize: CGFloat,
                                   hPad: CGFloat,
                                   vPad: CGFloat,
                                   gap: CGFloat,
                                   screenScale: CGFloat) -> (UIImage?, CGSize) {
        let font = UIFont.systemFont(ofSize: fontSize, weight: .semibold)
        let textAttrs: [NSAttributedString.Key: Any] = [.font: font, .foregroundColor: labelTextColor]
        let textSize = (label as NSString).size(withAttributes: textAttrs)
        let iconSize = fontSize
        let size = measuredBadgeSize(label: label, fontSize: fontSize,
                                     hPad: hPad, vPad: vPad, gap: gap)
        guard size.width > 0, size.height > 0 else { return (nil, size) }

        let format = UIGraphicsImageRendererFormat()
        format.scale = screenScale
        format.opaque = false
        let renderer = UIGraphicsImageRenderer(size: size, format: format)
        let image = renderer.image { _ in
            let pill = UIBezierPath(roundedRect: CGRect(origin: .zero, size: size),
                                    cornerRadius: size.height / 2)
            pillBackgroundColor.setFill()
            pill.fill()

            let iconRect = CGRect(x: hPad, y: (size.height - iconSize) / 2,
                                  width: iconSize, height: iconSize)
            let symbolConfig = UIImage.SymbolConfiguration(pointSize: iconSize * 0.82, weight: .semibold)
            UIImage(systemName: "mappin.circle.fill", withConfiguration: symbolConfig)?
                .withTintColor(pinTintColor, renderingMode: .alwaysOriginal)
                .draw(in: iconRect)

            let textRect = CGRect(x: hPad + iconSize + gap, y: (size.height - textSize.height) / 2,
                                  width: textSize.width, height: textSize.height)
            (label as NSString).draw(in: textRect, withAttributes: textAttrs)
        }
        return (image, size)
    }
}
