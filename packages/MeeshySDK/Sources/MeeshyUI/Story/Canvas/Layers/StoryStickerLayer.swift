import Foundation
import QuartzCore
import UIKit
import MeeshySDK

/// `CALayer` subclass that renders a `StorySticker` (single emoji glyph) as a
/// raster image cached by `StoryStickerRasterizer`.
///
/// `baseSize` is interpreted in design pixels (1080-référentiel) and projected
/// through `CanvasGeometry.render(_:)` so stickers retain identical visual
/// proportions across iPhone and iPad canvases.
public final class StoryStickerLayer: CALayer {
    // iOS 26.1 : deinit synthétisée ISOLÉE (SE-0466, isolation MainActor par
    // défaut) → double-free `pointer being freed was not allocated` (abrt)
    // au démontage hors d'une tâche (test XCTest synchrone, vue démontée).
    // Garde : MainActorDeinitSourceGuardTests / MeeshyUIDeinitSourceGuardTests.
    nonisolated deinit {}
    public private(set) nonisolated(unsafe) var sticker: StorySticker?

    public override nonisolated init() { super.init() }
    public override nonisolated init(layer: Any) { super.init(layer: layer) }

    @available(*, unavailable)
    public required nonisolated init?(coder: NSCoder) {
        fatalError("StoryStickerLayer does not support NSCoder")
    }

    @MainActor
    public func configure(with sticker: StorySticker,
                          geometry: CanvasGeometry,
                          mode: RenderMode,
                          renderScale: CGFloat = UIScreen.main.scale) {
        self.sticker = sticker

        // Règle partagée avec le composite et l'export — voir
        // `CanvasGeometry.stickerFontSize`, qui les faisait diverger.
        let renderedSide = CanvasGeometry.stickerFontSize(baseSize: sticker.baseSize,
                                                          scale: sticker.scale,
                                                          canvasWidth: geometry.renderSize.width)

        // **Une décoration se dessine, elle ne se rasterise pas en glyphe**
        // (#4718). Un gabarit MESURE son contenu — une heure, un nom de lieu —
        // donc sa boîte n'est pas le carré du glyphe.
        //
        // Un gabarit INCONNU (publié par une version plus récente) retombe sur
        // la branche emoji ci-dessous, qui sert `wireEmoji` : le lecteur voit
        // « 🕐 » plutôt qu'un trou.
        if sticker.kind == .template,
           let (image, taille) = StickerTemplateRenderer.image(
               templateID: sticker.templateId,
               slots: sticker.slots,
               metrics: StickerTemplateMetrics.sticker(geometry: geometry,
                                                       baseSize: sticker.baseSize,
                                                       scale: sticker.scale),
               screenScale: renderScale),
           taille.width > 0, taille.height > 0 {
            contents = image?.cgImage
            bounds = CGRect(origin: .zero, size: taille)
        } else {
            // `wireEmoji` et non `emoji` : un sticker gabarit posé sans emoji,
            // ou dont le gabarit est inconnu, doit quand même peindre quelque
            // chose — la chaîne vide laisserait un TROU là où l'auteur a posé.
            if let cg = StoryStickerRasterizer.shared.cgImage(for: sticker.wireEmoji,
                                                               size: renderedSide) {
                contents = cg
            }
            bounds = CGRect(x: 0, y: 0, width: renderedSide, height: renderedSide)
        }

        let designCenterX = geometry.designLength(forNormalized: CGFloat(sticker.x))
        let designCenterY = geometry.designHeightLength(forNormalized: CGFloat(sticker.y))
        position = geometry.render(CGPoint(x: designCenterX, y: designCenterY))
        anchorPoint = sticker.anchor
        transform = CATransform3DMakeRotation(CGFloat(sticker.rotation) * .pi / 180, 0, 0, 1)
        zPosition = CGFloat(sticker.zIndex)
        contentsScale = renderScale
        name = sticker.id

        // Stickers are pre-rasterized via StoryStickerRasterizer; in .play we
        // additionally flag the layer for the GPU rasterization fast path.
        // Une décoration ANIMÉE reste rasterisable : la pose (#4821) est une
        // transformation de la couche, pas un redessin de son contenu.
        shouldRasterize = mode == .play && sticker.isStatic
        if shouldRasterize { rasterizationScale = renderScale }
    }

    /// **Pose la transformation d'une animation** (#4821) — réappliquée à
    /// CHAQUE tick par la post-passe de `StoryRenderer`, jamais au build : la
    /// couche peut venir du cache d'export, où la transformation du tick
    /// précédent survivrait sinon.
    ///
    /// La rotation de l'AUTEUR et celle de l'animation s'additionnent ; le
    /// décalage est une fraction des `bounds`, donc indépendant de l'écran ; le
    /// pivot reste `anchorPoint`, posé par `configure`.
    @MainActor
    public func applyAnimationPose(_ pose: StickerAnimation.Pose,
                                   baseRotationDegrees: Double) {
        var pose3D = CATransform3DMakeTranslation(CGFloat(pose.offsetX) * bounds.width,
                                                  CGFloat(pose.offsetY) * bounds.height, 0)
        pose3D = CATransform3DRotate(pose3D,
                                     CGFloat(baseRotationDegrees + pose.rotationDegrees) * .pi / 180,
                                     0, 0, 1)
        pose3D = CATransform3DScale(pose3D, CGFloat(pose.scale), CGFloat(pose.scale), 1)
        transform = pose3D
    }
}
