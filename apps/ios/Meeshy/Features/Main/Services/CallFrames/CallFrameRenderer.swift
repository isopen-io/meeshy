import CoreGraphics
import CoreText
import Foundation
import MeeshySDK

/// Une personne à peindre : son identité (celle qu'on voit déjà dans l'appel) et l'image de sa caméra.
/// `image == nil` (caméra coupée) ⇒ un dégradé et son initiale, jamais une case retirée. Jamais en miroir.
nonisolated struct CallFramePortrait: @unchecked Sendable {
    let id: String
    let name: String
    let handle: String?
    let isSelf: Bool
    let image: CGImage?

    var person: CallFramePerson { CallFramePerson(id: id, name: name, handle: handle, isSelf: isSelf) }
}

/// Les deux couches d'un cadre qui ne dépendent pas des visages : le FOND (opaque) et le DESSUS (transparent).
nonisolated final class CallFrameLayers: @unchecked Sendable {
    let backdrop: CGImage
    let overlay: CGImage

    init(backdrop: CGImage, overlay: CGImage) {
        self.backdrop = backdrop
        self.overlay = overlay
    }

    var cost: Int { backdrop.bytesPerRow * backdrop.height + overlay.bytesPerRow * overlay.height }
}

/// Tout ce qu'un rendu sait d'un cadre, calculé UNE fois : zones, cases, personnes, textes.
nonisolated struct CallFrameStage {
    let frame: CallFrameDesign
    let size: CGSize
    let bounds: CGRect
    let areas: CallFrameAreas
    let boxes: [CallFrameSlotBox]
    let people: [CallFramePerson]
    let texts: CallFrameTexts

    init(frame: CallFrameDesign, people: [CallFramePerson], texts: CallFrameTexts, size: CGSize) {
        self.frame = frame
        self.size = size
        self.bounds = CGRect(origin: .zero, size: size)
        self.areas = CallFrameLayoutGeometry.areas(frame.look.layout, size: size)
        self.boxes = CallFrameLayoutGeometry.slots(for: frame, people: people.count, size: size)
        self.people = people
        self.texts = texts
    }

    var look: CallFrameLook { frame.look }
    var unit: CGFloat { areas.unit }

    /// L'encombrement de chaque case une fois tournée — ce qu'un ornement de premier plan évite.
    var footprints: [CGRect] { boxes.map { CallFrameRenderer.footprint(of: $0) } }
}

/// **LE PEINTRE DES CADRES DE CAPTURE** (#8741, spec § 5) — interprète un `CallFrameDesign`
/// en CoreGraphics (y vers le bas, `CTLine`), dans l'ordre du § 5.1 : fond → motif → ornements
/// `back` → cartes/ombres/halos → visages → traits de case → bordure → ornements `front` → noms →
/// titre/sous-titre → signature.
///
/// Le rendu est en COUCHES (§ 5.5) : ce qui ne dépend pas des visages se peint une fois par
/// (cadre, n, taille, textes, identités) et se réutilise à chaque image ; par image, seuls les
/// visages se dessinent. Le cache est borné (~48 Mo).
nonisolated enum CallFrameRenderer {
    static let layerCostLimit = 48 * 1024 * 1024

    nonisolated(unsafe) private static let layerCache: NSCache<NSString, CallFrameLayers> = {
        let cache = NSCache<NSString, CallFrameLayers>()
        cache.totalCostLimit = layerCostLimit
        return cache
    }()

    // MARK: - API

    static func render(frame: CallFrameDesign, portraits: [CallFramePortrait], texts: CallFrameTexts, size: CGSize) -> CGImage? {
        guard size.width >= 1, size.height >= 1 else { return nil }
        let stage = CallFrameStage(frame: frame, people: portraits.map { $0.person }, texts: texts, size: size)
        guard let cached = layers(for: stage), let context = CallMontageRenderer.makeContext(size: size) else { return nil }
        CallMontageRenderer.drawImage(context, cached.backdrop, aspectFill: stage.bounds)
        zip(stage.boxes, portraits).forEach { box, portrait in
            drawFace(context, portrait: portrait, box: box, stage: stage)
        }
        CallMontageRenderer.drawImage(context, cached.overlay, aspectFill: stage.bounds)
        return context.makeImage()
    }

    static func purgeLayers() {
        layerCache.removeAllObjects()
    }

    // MARK: - Couches

    static func layers(for stage: CallFrameStage) -> CallFrameLayers? {
        let key = layerKey(stage) as NSString
        if let hit = layerCache.object(forKey: key) { return hit }
        guard let backdrop = renderBackdrop(stage), let overlay = renderOverlay(stage) else { return nil }
        let painted = CallFrameLayers(backdrop: backdrop, overlay: overlay)
        layerCache.setObject(painted, forKey: key, cost: painted.cost)
        return painted
    }

    static func layerKey(_ stage: CallFrameStage) -> String {
        let texts = stage.texts
        let head: [String] = [
            stage.frame.id,
            String(stage.people.count),
            "\(Int(stage.size.width.rounded()))x\(Int(stage.size.height.rounded()))",
            texts.groupName ?? "\u{2205}",
            texts.isGroup ? "g" : "d",
            texts.date,
            texts.accentHex.map { "\($0.primary)/\($0.secondary)" } ?? "\u{2205}",
        ]
        let people = stage.people.map { "\($0.id)\u{1E}\($0.name)\u{1E}\($0.handle ?? "")\u{1E}\($0.isSelf ? 1 : 0)" }
        return (head + people).joined(separator: "\u{1F}")
    }

    static func renderBackdrop(_ stage: CallFrameStage) -> CGImage? {
        guard let context = CallMontageRenderer.makeContext(size: stage.size) else { return nil }
        let fonts = CallFrameFontBook()
        let layout = textLayout(stage, fonts: fonts)
        paintBackground(context, stage: stage)
        paintPattern(context, stage: stage)
        paintOrnaments(context, stage: stage, layer: .back, text: layout, fonts: fonts)
        stage.boxes.forEach { paintUnderlay(context, box: $0, stage: stage) }
        return context.makeImage()
    }

    static func renderOverlay(_ stage: CallFrameStage) -> CGImage? {
        guard let context = CallMontageRenderer.makeContext(size: stage.size) else { return nil }
        context.clear(stage.bounds)
        let fonts = CallFrameFontBook()
        let layout = textLayout(stage, fonts: fonts)
        stage.boxes.forEach { paintSlotStroke(context, box: $0, stage: stage) }
        paintBorder(context, stage: stage)
        paintOrnaments(context, stage: stage, layer: .front, text: layout, fonts: fonts)
        paintTexts(context, stage: stage, plan: layout.plan, fonts: fonts)
        return context.makeImage()
    }

    // MARK: - Géométrie commune

    /// L'encombrement d'une case tournée autour de son centre.
    static func footprint(of box: CallFrameSlotBox) -> CGRect {
        let radians = CGFloat(abs(box.rotation)) * .pi / 180
        let halfX = (box.rect.width * cos(radians) + box.rect.height * sin(radians)) / 2
        let halfY = (box.rect.width * sin(radians) + box.rect.height * cos(radians)) / 2
        return CGRect(x: box.rect.midX - halfX, y: box.rect.midY - halfY, width: halfX * 2, height: halfY * 2)
    }

    /// Le rectangle du visage dans sa case : la case entière, ou l'intérieur de la carte (marge `pad`, pied `foot`).
    static func photoRect(_ box: CGRect, card: CallFrameCard?) -> CGRect {
        guard let card else { return box }
        let side = min(box.width, box.height)
        let pad = CGFloat(card.pad) * side
        let foot = CGFloat(card.foot) * side
        return CGRect(x: box.minX + pad, y: box.minY + pad, width: max(0, box.width - pad * 2), height: max(0, box.height - pad * 2 - foot))
    }

    /// Exécute `body` dans le repère de la case : tourné de `box.rotation` degrés autour de son centre.
    static func inBox(_ context: CGContext, _ box: CallFrameSlotBox, _ body: () -> Void) {
        context.saveGState()
        if box.rotation != 0 {
            CallMontageRenderer.rotate(context, around: CGPoint(x: box.rect.midX, y: box.rect.midY), degrees: CGFloat(box.rotation))
        }
        body()
        context.restoreGState()
    }

    static func color(_ hex: String, alpha: Double = 1) -> CGColor {
        CallFrameColor.cg(hex, alpha: alpha)
    }

    /// Le hasard d'un cadre : une graine par ornement, une valeur par tirage — le même aperçu à chaque image.
    static func rand(_ seed: Double, _ draw: Double) -> CGFloat {
        CGFloat(CallFrameLayoutGeometry.scatter(seed * 97.13 + draw * 7.31 + 0.5))
    }
}
