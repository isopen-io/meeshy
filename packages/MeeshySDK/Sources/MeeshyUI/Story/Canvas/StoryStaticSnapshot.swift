import UIKit
import CoreMedia
import MeeshySDK

/// Renders a single slide to a static `UIImage` via the SAME pixel-perfect pipeline as
/// the live composer canvas and video export (`StoryRenderer` + `StoryTextLayer`) — font
/// family, weight, size, colour, ink-overhang, glass backgrounds all match what the
/// author actually composed. Used for personal-content covers (My Stories grid, draft
/// autosave, publish-time optimistic cover) — NOT for other users' content, which stays
/// on the cheaper `StorySlideRenderer.renderComposite` placeholder path by design.
@MainActor
public enum StoryStaticSnapshot {
    /// - Parameters:
    ///   - loadedImages: already-decoded bitmaps keyed by media object id (background
    ///     AND foreground) — the same dictionary shape as `StoryComposerViewModel.loadedImages`.
    ///     Un sticker IMAGE y range son bitmap sous son propre id (ou sous son
    ///     `postMediaId` une fois publié) — voir `StoryStickerLayer.bitmapCacheKeys`.
    ///   - bgImage: legacy flat background (no `mediaObjects` entry yet), the same value
    ///     `StorySlideRenderer.renderComposite`'s `bgImage:` parameter accepted.
    ///
    /// `StoryRenderer.render` only builds the FOREGROUND item tree (text/media/stickers/
    /// drawing) — the background is a layer `StoryCanvasUIView` owns and composites
    /// separately (`internal let backgroundLayer = StoryBackgroundLayer()`), and
    /// `StoryAVCompositor.renderFrame` mirrors that split for export: it paints the
    /// background directly into the pixel buffer (colour/gradient, then an image via
    /// `resolveBackgroundImage`), THEN renders the foreground tree on top
    /// (`layer.render(in: cg)`). This function follows the same two-step order, painting
    /// the background from already-in-memory bitmaps (no disk round-trip needed, unlike
    /// the export path which reads frame-by-frame from a background AVAssetReader).
    public static func render(slide: StorySlide,
                              loadedImages: [String: UIImage],
                              bgImage: UIImage? = nil,
                              size: CGSize) -> UIImage? {
        let geometry = CanvasGeometry(renderSize: size)
        // Le rendu est UN COUP : un bitmap qu'une tâche poserait une frame plus
        // tard n'atteindrait jamais l'image. `ComposerImageCacheReader` est le
        // seul lecteur que les couches lisent de façon SYNCHRONE — c'est par lui
        // que le bitmap d'un sticker collé (`loadedImages[sticker.id]`, #4852)
        // et celui d'un média de premier plan entrent dans la cover.
        let imageCache = ComposerImageCacheReader(images: loadedImages, version: 0)
        let layer = StoryRenderer.render(slide: slide,
                                         into: geometry,
                                         at: .zero,
                                         mode: .edit,
                                         imageCache: imageCache,
                                         contentsScale: 1.0)
        let renderer = UIGraphicsImageRenderer(size: size)
        return renderer.image { ctx in
            let cg = ctx.cgContext
            let rect = CGRect(origin: .zero, size: size)
            paintBackground(slide: slide, loadedImages: loadedImages, bgImage: bgImage,
                            in: rect, ctx: cg)
            layer.render(in: cg)
        }
    }

    private static func paintBackground(slide: StorySlide,
                                        loadedImages: [String: UIImage],
                                        bgImage: UIImage?,
                                        in rect: CGRect,
                                        ctx: CGContext) {
        switch StoryBackgroundValue.parse(slide.effects.background ?? "1E1B4B") {
        case .hex(let hex):
            Self.parseHexColor(hex).setFill()
            ctx.fill(rect)
        case .gradient(let a, let b):
            let colors = [Self.parseHexColor(a).cgColor, Self.parseHexColor(b).cgColor]
            if let gradient = CGGradient(colorsSpace: CGColorSpaceCreateDeviceRGB(),
                                         colors: colors as CFArray, locations: [0, 1]) {
                ctx.drawLinearGradient(gradient, start: rect.origin,
                                       end: CGPoint(x: rect.maxX, y: rect.maxY), options: [])
            }
        }

        // Modern background media object — image OR video poster frame, both carried as a
        // plain bitmap in `loadedImages[media.id]` (parity with `StorySlideRenderer`'s
        // "vaut pour les fonds IMAGE et VIDÉO" handling).
        if let bgMedia = slide.effects.mediaObjects?.first(where: { $0.isBackground }),
           let image = loadedImages[bgMedia.id] {
            drawAspectFill(image, in: rect, ctx: ctx)
            return
        }
        // Legacy flat background (pre-mediaObjects).
        if let bgImage {
            drawAspectFill(bgImage, in: rect, ctx: ctx)
        }
    }

    /// `UIColor(hex:)` is `private` to `StorySlideRenderer.swift` — not visible here.
    private static func parseHexColor(_ hex: String) -> UIColor {
        let sanitized = hex.trimmingCharacters(in: .whitespacesAndNewlines)
            .replacingOccurrences(of: "#", with: "")
        guard sanitized.count == 6, let rgb = UInt64(sanitized, radix: 16) else { return .black }
        return UIColor(red: CGFloat((rgb >> 16) & 0xFF) / 255.0,
                       green: CGFloat((rgb >> 8) & 0xFF) / 255.0,
                       blue: CGFloat(rgb & 0xFF) / 255.0,
                       alpha: 1.0)
    }

    private static func drawAspectFill(_ image: UIImage, in rect: CGRect, ctx: CGContext) {
        let imageSize = image.size
        guard imageSize.width > 0, imageSize.height > 0 else { return }
        let scale = max(rect.width / imageSize.width, rect.height / imageSize.height)
        let scaledSize = CGSize(width: imageSize.width * scale, height: imageSize.height * scale)
        let origin = CGPoint(x: rect.midX - scaledSize.width / 2, y: rect.midY - scaledSize.height / 2)
        ctx.saveGState()
        ctx.clip(to: rect)
        image.draw(in: CGRect(origin: origin, size: scaledSize))
        ctx.restoreGState()
    }
}
