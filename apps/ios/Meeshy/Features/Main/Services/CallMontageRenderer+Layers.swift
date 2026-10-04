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
        guard size.width >= 1, size.height >= 1 else { return nil }
        let trou = CallMontageHole()
        let portrait = CallMontagePortrait(id: person.id, name: person.name, image: nil, hole: trou)
        guard let calque = render(style: style, portraits: [portrait], canvas: size, caption: caption),
              let chemin = trou.path,
              let dessus = CallLiveFrameCompositor.baked(calque),
              let masque = holeMask(path: chemin, toCanvas: trou.toCanvas, size: size) else { return nil }
        let etendue = CGRect(origin: .zero, size: size)
        let vide = CIImage(color: .clear).cropped(to: etendue)
        let case_ = CallLiveFrameSlot(personId: person.id, photo: trou.frame, rotation: 0, mask: masque,
                                      placeholder: vide, tone: tone(of: style), duotone: nil,
                                      placement: trou.toCanvas)
        let textes = CallFrameTexts(groupName: nil, isGroup: false, date: caption.subtitle, accentHex: nil)
        let entrees = CallLiveFrameLayerInputs(frameId: "classic-\(style.rawValue)", people: [person],
                                               texts: textes, size: size)
        return CallLiveFrameScene(inputs: entrees, backdrop: vide, overlay: dessus, slots: [case_])
    }

    /// Le ton de la case : `noir` désature sa photo (mode `.saturation` du CPU),
    /// les autres la laissent en couleur.
    static func tone(of style: CallMontageStyle) -> CallFrameTone {
        style == .noir ? .mono : .color
    }

    /// Le chemin relevé, rempli en blanc dans le repère du périphérique (y vers le
    /// haut) — celui de Core Image.
    static func holeMask(path: CGPath, toCanvas: CGAffineTransform, size: CGSize) -> CIImage? {
        guard let context = makeContext(size: size) else { return nil }
        context.concatenate(context.userSpaceToDeviceSpaceTransform.inverted())
        var transformation = toCanvas
        guard let pose = path.copy(using: &transformation) else { return nil }
        context.addPath(pose)
        context.setFillColor(CGColor(gray: 1, alpha: 1))
        context.fillPath()
        guard let image = context.makeImage() else { return nil }
        return CallLiveFrameCompositor.baked(image)
    }
}
