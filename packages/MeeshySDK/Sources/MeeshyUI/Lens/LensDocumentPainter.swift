import CoreGraphics
import CoreImage
import Foundation
import MeeshySDK

/// Les fichiers d'une lens, REMIS par l'hôte déjà décodés : le peintre n'ouvre
/// rien et ne télécharge rien — le contrat v1 interdit tout réseau à une lens.
/// Un fichier absent n'est pas peint, et le reste de la lens l'est.
public nonisolated struct LensAssets {
    /// Un sticker du pack, par son nom adressé par contenu.
    public let sticker: (String) -> CIImage?
    /// Le cube d'une LUT du pack (`LensLutStrip.cube(from:)`).
    public let lut: (String) -> LensLutCube?
    /// Le cadre d'un motif des vocabulaires de l'hôte, à la taille de l'image, origine en (0, 0).
    public let frame: (String, CGSize) -> CIImage?

    public init(sticker: @escaping (String) -> CIImage? = { _ in nil },
                lut: @escaping (String) -> LensLutCube? = { _ in nil },
                frame: @escaping (String, CGSize) -> CIImage? = { _, _ in nil }) {
        self.sticker = sticker
        self.lut = lut
        self.frame = frame
    }
}

/// **UNE LENS MEESHYLENS v1, PEINTE** (#11300) : le plan (`LensPlan`, le même que
/// le web) devient des passes du peintre unique (`LensPainter`, #11298), chacune
/// à l'étage de sa couche. Les cinq primitives : LUT, cadre, sticker, texte,
/// particules.
public nonisolated enum LensDocumentPainter {

    public static func paint(_ source: CIImage, lens: LensDocument, input: LensFrameInput,
                             languages: [String], level: LensLevel, hidden: Set<String> = [], assets: LensAssets) -> CIImage {
        let extent = source.extent
        let plan = LensPlan.plan(LensPlanInput(lens: lens, frame: extent.size, face: input.face?.imageBox(in: extent.size),
                                               languages: languages, level: level, milliseconds: input.time * 1000, hidden: hidden))
        return LensPainter.paint(source, passes: passes(for: plan, lens: lens, extent: extent, assets: assets), input: input)
    }

    public static func passes(for plan: [LensDrawOp], lens: LensDocument, extent: CGRect, assets: LensAssets) -> [LensPass] {
        let layers = Dictionary(lens.layers.map { ($0.id, $0) }, uniquingKeysWith: { first, _ in first })
        return plan.compactMap { op in
            guard let layer = layers[op.id] else { return nil }
            return pass(for: op, stage: LensStage(layer: layer), extent: extent, assets: assets)
        }
    }

    private static func pass(for op: LensDrawOp, stage: LensStage, extent: CGRect, assets: LensAssets) -> LensPass? {
        switch op {
        case let .lut(lut):
            return assets.lut(lut.asset).map { LensPass.lut($0, intensity: lut.intensity) }
        case let .frame(frame):
            return frameOverlay(frame, extent: extent, assets: assets).map { LensPass.overlay($0, stage: stage) }
        case let .sticker(sticker):
            return stickerOverlay(sticker, extent: extent, assets: assets).map { LensPass.overlay($0, stage: stage) }
        case let .text(text):
            return LensTextPainter.image(of: text, center: point(x: text.x, y: text.y, in: extent)).map { LensPass.overlay($0, stage: stage) }
        case let .particles(particles):
            return LensPass.overlay(particlesOverlay(particles, extent: extent), stage: stage)
        }
    }

    /// Un point du plan (origine en haut) dans le repère de Core Image (origine en bas).
    static func point(x: Double, y: Double, in extent: CGRect) -> CGPoint {
        CGPoint(x: extent.minX + x, y: extent.maxY - y)
    }

    private static func frameOverlay(_ op: LensFrameOp, extent: CGRect, assets: LensAssets) -> CIImage? {
        guard op.opacity > 0, let drawn = assets.frame(op.motif, extent.size) else { return nil }
        let placed = drawn.transformed(by: CGAffineTransform(translationX: extent.minX, y: extent.minY))
        guard op.opacity < 1 else { return placed }
        return placed.applyingFilter("CIColorMatrix", parameters: ["inputAVector": CIVector(x: 0, y: 0, z: 0, w: op.opacity)])
    }

    /// Le sticker étiré au carré de sa taille, tourné dans le sens des aiguilles d'une montre
    /// (le sens du canevas du web), centré sur son ancre.
    private static func stickerOverlay(_ op: LensStickerOp, extent: CGRect, assets: LensAssets) -> CIImage? {
        guard op.size > 0, let image = assets.sticker(op.asset) else { return nil }
        let box = image.extent
        guard !box.isInfinite, box.width > 0, box.height > 0 else { return nil }
        let center = point(x: op.x, y: op.y, in: extent)
        let pose = CGAffineTransform(translationX: -box.midX, y: -box.midY)
            .concatenating(CGAffineTransform(scaleX: op.size / box.width, y: op.size / box.height))
            .concatenating(CGAffineTransform(rotationAngle: -op.rotation))
            .concatenating(CGAffineTransform(translationX: center.x, y: center.y))
        return image.transformed(by: pose)
    }

    static func particleColor(_ preset: LensParticlePreset) -> String {
        switch preset {
        case .sparkles: return "#FFF4B8"
        case .confetti: return "#F472B6"
        case .hearts: return "#FB7185"
        case .stars: return "#FDE68A"
        case .snow: return "#F8FAFC"
        case .petals: return "#F9A8D4"
        case .bubbles: return "#BAE6FD"
        case .fireflies: return "#D9F99D"
        }
    }

    /// Les points d'une nuée, ronds et lissés au bord, à l'opacité que le plan leur donne.
    private static func particlesOverlay(_ op: LensParticlesOp, extent: CGRect) -> CIImage {
        let tint = LensTextPainter.components(particleColor(op.preset))
        return op.dots.filter { $0.alpha > 0 && $0.r > 0 }.reduce(CIImage.empty()) { overlay, dot in
            let center = point(x: dot.x, y: dot.y, in: extent)
            let dotImage = CIImage.radialDot(center: center, radius: dot.r,
                                             color: CIColor(red: tint.red, green: tint.green, blue: tint.blue, alpha: CGFloat(dot.alpha)))
            return dotImage.composited(over: overlay)
        }
    }
}

private extension CIImage {
    nonisolated static func radialDot(center: CGPoint, radius: Double, color: CIColor) -> CIImage {
        let gradient = CIFilter(name: "CIRadialGradient", parameters: [
            "inputCenter": CIVector(x: center.x, y: center.y),
            "inputRadius0": max(0, radius - 0.5),
            "inputRadius1": radius + 0.5,
            "inputColor0": color,
            "inputColor1": CIColor(red: 0, green: 0, blue: 0, alpha: 0),
        ])?.outputImage ?? CIImage.empty()
        return gradient.cropped(to: CGRect(x: center.x - radius - 1, y: center.y - radius - 1, width: 2 * radius + 2, height: 2 * radius + 2))
    }
}
