import CoreGraphics
import CoreImage
import CoreImage.CIFilterBuiltins
import CoreVideo
import Foundation

/// Les passages de repère du cadre en direct. Le peintre écrit en haut-à-gauche, y vers le bas
/// (`CallFrameLayoutGeometry`) ; Core Image compose en bas-à-gauche, y vers le haut. Les angles
/// d'une case sont en degrés dans le sens horaire À L'ÉCRAN — donc négatifs pour Core Image.
nonisolated enum CallLiveFrameGeometry {
    /// Un rectangle de la toile (y vers le bas) dans le repère Core Image (y vers le haut).
    static func flipped(_ rect: CGRect, canvasHeight: CGFloat) -> CGRect {
        CGRect(x: rect.minX, y: canvasHeight - rect.maxY, width: rect.width, height: rect.height)
    }

    /// L'image vidéo `source` remplie dans `photo` (sans déformation, centrée, débordant), puis
    /// tournée de `degrees` autour du centre de la case — le même cadrage que le peintre CPU.
    static func videoTransform(source: CGRect, photo: CGRect, degrees: Double, canvasHeight: CGFloat) -> CGAffineTransform {
        guard source.width > 0, source.height > 0, photo.width > 0, photo.height > 0 else { return .identity }
        let target = flipped(photo, canvasHeight: canvasHeight)
        let scale = max(target.width / source.width, target.height / source.height)
        let fill = CGAffineTransform(translationX: -source.midX, y: -source.midY)
            .concatenating(CGAffineTransform(scaleX: scale, y: scale))
            .concatenating(CGAffineTransform(translationX: target.midX, y: target.midY))
        guard degrees != 0 else { return fill }
        let radians = -CGFloat(degrees) * .pi / 180
        let center = CGPoint(x: target.midX, y: target.midY)
        let turn = CGAffineTransform(translationX: -center.x, y: -center.y)
            .concatenating(CGAffineTransform(rotationAngle: radians))
            .concatenating(CGAffineTransform(translationX: center.x, y: center.y))
        return fill.concatenating(turn)
    }

    /// La scène peinte à `scene` remplit l'écran à `drawable` (même proportion à l'arrondi près).
    static func fit(scene: CGSize, into drawable: CGSize) -> CGAffineTransform {
        guard scene.width > 0, scene.height > 0 else { return .identity }
        let scale = max(drawable.width / scene.width, drawable.height / scene.height)
        let drawn = CGSize(width: scene.width * scale, height: scene.height * scale)
        return CGAffineTransform(scaleX: scale, y: scale)
            .concatenating(CGAffineTransform(translationX: (drawable.width - drawn.width) / 2, y: (drawable.height - drawn.height) / 2))
    }
}

/// Une case prête à recevoir une vidéo : sa forme (masque alpha), son visage de repli
/// (caméra coupée ⇒ dégradé et initiale, jamais une case retirée) et son cadrage.
nonisolated struct CallLiveFrameSlot: @unchecked Sendable {
    let personId: String
    let photo: CGRect
    let rotation: Double
    let mask: CIImage
    let placeholder: CIImage
    let tone: CallFrameTone
    let duotone: CallFrameDuotone?
}

/// Les couches CUITES d'un cadre (doc frames 02 § 3.3) : peintes une fois par le processeur,
/// gardées dans des tampons IOSurface que la carte graphique lit sans copie à chaque image.
nonisolated final class CallLiveFrameScene: @unchecked Sendable {
    let inputs: CallLiveFrameLayerInputs
    let backdrop: CIImage
    let overlay: CIImage
    let slots: [CallLiveFrameSlot]

    init(inputs: CallLiveFrameLayerInputs, backdrop: CIImage, overlay: CIImage, slots: [CallLiveFrameSlot]) {
        self.inputs = inputs
        self.backdrop = backdrop
        self.overlay = overlay
        self.slots = slots
    }

    var size: CGSize { inputs.size }
    var extent: CGRect { CGRect(origin: .zero, size: inputs.size) }
}

/// Ce que le compositeur sait faire, pour que l'écran d'appel le reçoive injecté.
protocol CallLiveFrameCompositing: AnyObject, Sendable {
    nonisolated func paint(design: CallFrameDesign, inputs: CallLiveFrameLayerInputs) -> CallLiveFrameScene?
    nonisolated func compose(_ scene: CallLiveFrameScene, videos: [String: CIImage]) -> CIImage
}

/// **LE COMPOSITEUR DU CADRE EN DIRECT** (#9214, doc frames 06 § 4.1-4.2).
///
/// 1. `paint` — sur le processeur, une fois : `CallFrameRenderer` peint le fond et le dessus
///    (son cache de couches est partagé avec le Montage), puis le masque et le visage de repli
///    de chaque case. Tout est cuit dans des `CVPixelBuffer` IOSurface.
/// 2. `compose` — à chaque image, un seul graphe Core Image : fond → chaque vidéo dans sa case
///    (cadrée, tonalisée, découpée par la forme) → dessus. Le `CIContext` Metal de l'hôte le
///    rend en un passage dans le drawable.
///
/// Rien ici ne touche la vidéo ENVOYÉE : le cadre est composé chez chacun, sur ce qu'il voit.
nonisolated final class CallLiveFrameCompositor: CallLiveFrameCompositing, @unchecked Sendable {
    init() {}

    // MARK: - Peindre (processeur, une fois)

    func paint(design: CallFrameDesign, inputs: CallLiveFrameLayerInputs) -> CallLiveFrameScene? {
        guard inputs.size.width >= 1, inputs.size.height >= 1 else { return nil }
        let stage = CallFrameStage(frame: design, people: inputs.people, texts: inputs.texts, size: inputs.size)
        guard let layers = CallFrameRenderer.layers(for: stage),
              let backdrop = Self.baked(layers.backdrop),
              let overlay = Self.baked(layers.overlay) else { return nil }
        let slots = zip(stage.boxes, inputs.people).compactMap { box, person in
            Self.slot(box: box, person: person, stage: stage)
        }
        return CallLiveFrameScene(inputs: inputs, backdrop: backdrop, overlay: overlay, slots: slots)
    }

    static func slot(box: CallFrameSlotBox, person: CallFramePerson, stage: CallFrameStage) -> CallLiveFrameSlot? {
        let style = stage.look.slot
        let photo = CallFrameRenderer.photoRect(box.rect, card: style.card)
        let footprint = CallFrameRenderer.footprint(of: box).integral.intersection(stage.bounds)
        guard photo.width > 0, photo.height > 0, !footprint.isNull, footprint.width >= 1, footprint.height >= 1 else { return nil }
        let mask = paintPatch(footprint, canvasHeight: stage.size.height) { context in
            CallFrameRenderer.inBox(context, box) {
                context.addPath(CallFrameRenderer.slotPath(for: box, in: photo, slot: style))
                context.setFillColor(CGColor(gray: 1, alpha: 1))
                context.fillPath()
            }
        }
        let portrait = CallFramePortrait(id: person.id, name: person.name, handle: person.handle, isSelf: person.isSelf, image: nil)
        let placeholder = paintPatch(footprint, canvasHeight: stage.size.height) { context in
            CallFrameRenderer.drawFace(context, portrait: portrait, box: box, stage: stage)
        }
        guard let mask, let placeholder else { return nil }
        return CallLiveFrameSlot(
            personId: person.id, photo: photo, rotation: box.rotation, mask: mask, placeholder: placeholder,
            tone: style.tone, duotone: style.duotone
        )
    }

    /// Un morceau de la toile, peint dans son propre contexte (repère de la toile, y vers le bas)
    /// puis placé à sa position dans le repère Core Image.
    static func paintPatch(_ rect: CGRect, canvasHeight: CGFloat, _ body: (CGContext) -> Void) -> CIImage? {
        guard let context = CallMontageRenderer.makeContext(size: rect.size) else { return nil }
        context.clear(CGRect(origin: .zero, size: rect.size))
        context.translateBy(x: -rect.minX, y: -rect.minY)
        body(context)
        guard let image = context.makeImage(), let baked = baked(image) else { return nil }
        let origin = CallLiveFrameGeometry.flipped(rect, canvasHeight: canvasHeight).origin
        return baked.transformed(by: CGAffineTransform(translationX: origin.x, y: origin.y))
    }

    /// Une image du peintre, copiée UNE fois dans un tampon IOSurface (BGRA prémultiplié) :
    /// la carte graphique le lit ensuite à chaque image sans le recharger.
    static func baked(_ image: CGImage) -> CIImage? {
        let attributes: [CFString: Any] = [
            kCVPixelBufferIOSurfacePropertiesKey: [String: Any](),
            kCVPixelBufferMetalCompatibilityKey: true,
            kCVPixelBufferCGBitmapContextCompatibilityKey: true,
        ]
        var buffer: CVPixelBuffer?
        let status = CVPixelBufferCreate(kCFAllocatorDefault, image.width, image.height, kCVPixelFormatType_32BGRA, attributes as CFDictionary, &buffer)
        guard status == kCVReturnSuccess, let buffer else { return nil }
        CVPixelBufferLockBaseAddress(buffer, [])
        defer { CVPixelBufferUnlockBaseAddress(buffer, []) }
        guard let context = CGContext(
            data: CVPixelBufferGetBaseAddress(buffer),
            width: image.width,
            height: image.height,
            bitsPerComponent: 8,
            bytesPerRow: CVPixelBufferGetBytesPerRow(buffer),
            space: CGColorSpaceCreateDeviceRGB(),
            bitmapInfo: CGImageAlphaInfo.premultipliedFirst.rawValue | CGBitmapInfo.byteOrder32Little.rawValue
        ) else { return nil }
        let bounds = CGRect(x: 0, y: 0, width: image.width, height: image.height)
        context.clear(bounds)
        context.draw(image, in: bounds)
        return CIImage(cvPixelBuffer: buffer)
    }

    // MARK: - Composer (carte graphique, chaque image)

    func compose(_ scene: CallLiveFrameScene, videos: [String: CIImage]) -> CIImage {
        let faces = scene.slots.reduce(scene.backdrop) { below, slot in
            let face = videos[slot.personId].map { place($0, in: slot, canvasHeight: scene.size.height) } ?? slot.placeholder
            return face.applyingFilter("CIBlendWithAlphaMask", parameters: [
                kCIInputBackgroundImageKey: below,
                kCIInputMaskImageKey: slot.mask,
            ])
        }
        return scene.overlay.composited(over: faces).cropped(to: scene.extent)
    }

    func place(_ video: CIImage, in slot: CallLiveFrameSlot, canvasHeight: CGFloat) -> CIImage {
        let transform = CallLiveFrameGeometry.videoTransform(source: video.extent, photo: slot.photo, degrees: slot.rotation, canvasHeight: canvasHeight)
        return Self.toned(video.transformed(by: transform), slot: slot).cropped(to: slot.mask.extent)
    }

    /// Le ton d'une case (§ 4.2 de la spec des cadres) par les filtres intégrés de Core Image —
    /// l'équivalent GPU des modes de fusion du peintre, au plus une passe par case.
    static func toned(_ image: CIImage, slot: CallLiveFrameSlot) -> CIImage {
        switch slot.tone {
        case .color:
            return image
        case .mono:
            return image.applyingFilter("CIPhotoEffectMono")
        case .noir:
            return image.applyingFilter("CIPhotoEffectNoir")
        case .sepia:
            return image.applyingFilter("CISepiaTone", parameters: [kCIInputIntensityKey: 0.85])
        case .faded:
            return image.applyingFilter("CIPhotoEffectFade")
        case .warm:
            return image.applyingFilter("CITemperatureAndTint", parameters: ["inputNeutral": CIVector(x: 6500, y: 0), "inputTargetNeutral": CIVector(x: 5200, y: 0)])
        case .cool:
            return image.applyingFilter("CITemperatureAndTint", parameters: ["inputNeutral": CIVector(x: 6500, y: 0), "inputTargetNeutral": CIVector(x: 8000, y: 0)])
        case .duotone:
            let pair = slot.duotone ?? CallFrameDuotone(shadow: "#1E1B4B", light: "#F0ABFC")
            return image.applyingFilter("CIFalseColor", parameters: ["inputColor0": ciColor(pair.shadow), "inputColor1": ciColor(pair.light)])
        }
    }

    static func ciColor(_ hex: String) -> CIColor {
        CIColor(cgColor: CallFrameColor.cg(hex))
    }
}
