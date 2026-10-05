import CoreGraphics
import CoreImage
import Foundation

/// **Là où le portrait d'un classique se pose**, relevé PENDANT que le peintre le
/// peint (#9348) : le chemin de la case et la transformation exacte du contexte
/// à cet instant — la rotation d'une polaroïd autour de sa carte comprise.
nonisolated final class CallMontageHole: @unchecked Sendable {
    private(set) var path: CGPath?
    private(set) var frame: CGRect = .zero
    private(set) var toCanvas: CGAffineTransform = .identity

    nonisolated deinit {}

    func record(path: CGPath, frame: CGRect, toCanvas: CGAffineTransform) {
        guard self.path == nil else { return }
        self.path = path
        self.frame = frame
        self.toCanvas = toCanvas
    }
}

/// **Un classique du Montage, en couches** (#9348, spec § 4.2) : le peintre CPU
/// peint le décor et le dessus UNE fois, avec un trou à la place du portrait ;
/// la carte graphique pose la vidéo dans ce trou à chaque image.
nonisolated extension CallMontageRenderer {

    static func layers(style: CallMontageStyle, person: CallFramePerson, caption: CallMontageCaption,
                       size: CGSize) -> CallLiveFrameScene? {
        guard size.width >= 1, size.height >= 1,
              let base = makeContext(size: CGSize(width: 1, height: size.height))?.userSpaceToDeviceSpaceTransform
        else { return nil }
        let trou = CallMontageHole()
        let portrait = CallMontagePortrait(id: person.id, name: person.name, image: nil, hole: trou)
        guard let calque = render(style: style, portraits: [portrait], canvas: size, caption: caption),
              let chemin = trou.path else { return nil }
        let versLaToile = trou.toCanvas.concatenating(base.inverted())
        guard let dessus = CallLiveFrameCompositor.baked(calque),
              let masque = holeMask(path: chemin, inCanvas: versLaToile, size: size) else { return nil }
        let etendue = CGRect(origin: .zero, size: size)
        let vide = CIImage(color: .clear).cropped(to: etendue)
        let case_ = CallLiveFrameSlot(personId: person.id, photo: trou.frame, rotation: 0, mask: masque,
                                      placeholder: vide, tone: tone(of: style), duotone: nil,
                                      placement: versLaToile.concatenating(coreImage(canvasHeight: size.height)))
        let textes = CallFrameTexts(groupName: nil, isGroup: false, date: caption.subtitle, accentHex: nil)
        let entrees = CallLiveFrameLayerInputs(frameId: "classic-\(style.rawValue)", people: [person],
                                               texts: textes, size: size)
        return CallLiveFrameScene(inputs: entrees, backdrop: vide, overlay: dessus, slots: [case_])
    }

    /// Le ton de la case : `noir` réduit sa photo à sa luminance (le mode
    /// `.saturation` du CPU sur un gris), les autres la laissent en couleur.
    static func tone(of style: CallMontageStyle) -> CallFrameTone {
        style == .noir ? .luminosity : .color
    }

    /// La toile du peintre (y vers le bas) dans le repère de Core Image (y vers le haut).
    static func coreImage(canvasHeight: CGFloat) -> CGAffineTransform {
        CGAffineTransform(a: 1, b: 0, c: 0, d: -1, tx: 0, ty: canvasHeight)
    }

    /// La découpe déborde le trou d'un pixel : le bord antialiasé du calque, où le décor
    /// ne couvre qu'en partie, reçoit la vidéo PLEINE — aucun liseré translucide.
    static let maskBleed: CGFloat = 1

    /// Le chemin relevé, rempli en blanc sur la toile du peintre — le repère même du
    /// calque, quelle que soit la convention du périphérique — dans un fragment borné
    /// au trou : une photo pleine définition ne cuit jamais un masque de toute la toile.
    static func holeMask(path: CGPath, inCanvas: CGAffineTransform, size: CGSize) -> CIImage? {
        var transformation = inCanvas
        guard let pose = path.copy(using: &transformation) else { return nil }
        let marge = maskBleed * 2
        let zone = pose.boundingBoxOfPath.insetBy(dx: -marge, dy: -marge).integral
            .intersection(CGRect(origin: .zero, size: size))
        guard !zone.isNull, zone.width >= 1, zone.height >= 1 else { return nil }
        return CallLiveFrameCompositor.paintPatch(zone, canvasHeight: size.height) { context in
            context.setFillColor(CGColor(gray: 1, alpha: 1))
            context.addPath(pose)
            context.fillPath()
            context.setStrokeColor(CGColor(gray: 1, alpha: 1))
            context.setLineWidth(maskBleed * 2)
            context.addPath(pose)
            context.strokePath()
        }
    }
}
