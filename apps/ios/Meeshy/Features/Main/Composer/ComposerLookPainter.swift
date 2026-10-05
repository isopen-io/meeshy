import CoreGraphics
import CoreImage
import Foundation
import Metal

/// **Ce qui identifie une scène cuite** (#9347) : le look, la toile, et ce que
/// le cadre ÉCRIT — l'auteur et la date de la SESSION, jamais celle du rendu.
nonisolated struct ComposerLookSceneKey: Equatable, Sendable {
    let look: ComposerPhotoLook
    let canvas: CGSize
    let date: Date
    let person: CallFramePerson

    var cacheKey: NSString {
        let morceaux = [
            look.filter.rawValue,
            Self.token(look.frame),
            "\(Int(canvas.width.rounded()))x\(Int(canvas.height.rounded()))",
            CallFrameTextsRule.dateText(date),
            person.id, person.name, person.handle ?? "",
        ]
        return morceaux.joined(separator: "|") as NSString
    }

    static func token(_ frame: ComposerPhotoFrame) -> String {
        switch frame {
        case .none: return "none"
        case .montage(.classic(let style)): return "classic:\(style.rawValue)"
        case .montage(.frame(let id)): return "frame:\(id)"
        }
    }
}

/// **Le processeur graphique de la capture, partagé** (spec § 5) : un seul
/// `CIContext` Metal pour l'aperçu, la bande, la boucle et la photo.
nonisolated enum ComposerLookGPU {
    nonisolated(unsafe) static let device: MTLDevice? = MTLCreateSystemDefaultDevice()
    nonisolated(unsafe) static let commandQueue: MTLCommandQueue? = device?.makeCommandQueue()
    static let context: CIContext = device.map {
        CIContext(mtlDevice: $0, options: [.cacheIntermediates: false, .priorityRequestLow: false])
    } ?? CIContext(options: [.cacheIntermediates: false])
}

/// **LE PEINTRE UNIQUE de la capture** (#9347, spec § 4.1).
///
/// L'aperçu (vue Metal), la photo, l'export vidéo, la boucle d'édition et les
/// miniatures appellent `paint` — un graphe Core Image pur, en un passage :
/// colorimétrie de l'appel → cadrage → ton de la case → fond / case / calque.
/// Ce qu'on voit est donc ce qui part, par construction.
nonisolated enum ComposerLookPainter {

    /// Le REPÈRE de dessin : 9:16, 1080×1920. Il dit les proportions (ajustement à
    /// l'écran) et la toile de l'aperçu ; ce qui PART se peint à `canvas(for:)`.
    static let designCanvas = CGSize(width: 1080, height: 1920)
    /// La toile d'une miniature de la bande.
    static let thumbnailCanvas = CGSize(width: 162, height: 288)

    /// **Le canevas qui part : le plus grand recadrage 9:16 de la source**, à sa
    /// résolution native, jamais réduit (décision porteur 2026-10-04). Des
    /// multiples PAIRS de 9 × 16 : proportion exacte, dimensions paires (encodeurs).
    static func canvas(for source: CGSize) -> CGSize {
        let pas = Int(min(source.width / 9, source.height / 16).rounded(.down))
        let pair = max(2, pas - pas % 2)
        return CGSize(width: 9 * pair, height: 16 * pair)
    }

    private static let compositor = CallLiveFrameCompositor()

    /// Les couches statiques d'un look, peintes par le processeur — un cadre du
    /// catalogue comme un classique du Montage (#9348). `nil` sans cadre, ou pour
    /// un cadre inconnu du catalogue. À appeler HORS du fil principal.
    static func scene(for look: ComposerPhotoLook, canvas: CGSize, date: Date,
                      person: CallFramePerson) -> CallLiveFrameScene? {
        switch look.frame {
        case .none:
            return nil
        case .montage(.frame(let id)):
            guard let design = CallMontageFrameRule.design(id: id) else { return nil }
            let inputs = CallLiveFrameLayerInputs(frameId: design.id, people: [person],
                                                  texts: ComposerPhotoLookSource.texts(at: date), size: canvas)
            return compositor.paint(design: design, inputs: inputs, cachingLayers: cachesLayers(for: canvas))
        case .montage(.classic(let style)):
            return CallMontageRenderer.layers(style: style, person: person,
                                              caption: ComposerPhotoLookSource.caption(at: date), size: canvas)
        }
    }

    /// Seules les toiles de l'écran gardent leurs couches dans le cache du peintre
    /// d'appel : celle d'une photo pleine définition l'évincerait pour un seul usage.
    static func cachesLayers(for canvas: CGSize) -> Bool {
        canvas.width <= designCanvas.width && canvas.height <= designCanvas.height
    }

    static func scene(for key: ComposerLookSceneKey) -> CallLiveFrameScene? {
        scene(for: key.look, canvas: key.canvas, date: key.date, person: key.person)
    }

    /// Le graphe. `scene` doit avoir été cuite pour `canvas`.
    static func paint(_ source: CIImage, look: ComposerPhotoLook, framing: ComposerFraming,
                      scene: CallLiveFrameScene?, canvas: CGSize, declared: CGColorSpace? = nil) -> CIImage {
        let graded = ComposerLiveLookRule.graded(source, filter: look.filter, declared: declared)
        guard let scene, let slot = scene.slots.first, slot.photo.height > 0 else {
            return filled(graded, framing: framing, into: CGRect(origin: .zero, size: canvas))
        }
        let cadre = filled(graded, framing: framing,
                           into: CallLiveFrameGeometry.flipped(slot.photo, canvasHeight: scene.size.height))
        return compositor.compose(scene, videos: [slot.personId: cadre])
    }

    /// La fenêtre du cadrage, posée pour remplir exactement `target`. La source est
    /// étendue au-delà de ses bords avant l'échelle : un bord ne se mélange jamais
    /// au transparent, aucun liseré sombre dans le JPEG ou le HEIC.
    static func filled(_ image: CIImage, framing: ComposerFraming, into target: CGRect) -> CIImage {
        guard target.width > 0, target.height > 0 else { return image }
        let fenetre = framing.window(in: image.extent, aspect: target.width / target.height)
        guard fenetre.width > 0, fenetre.height > 0 else { return image }
        let pose = CGAffineTransform(translationX: -fenetre.minX, y: -fenetre.minY)
            .concatenating(CGAffineTransform(scaleX: target.width / fenetre.width, y: target.height / fenetre.height))
            .concatenating(CGAffineTransform(translationX: target.minX, y: target.minY))
        return image.clampedToExtent().transformed(by: pose).cropped(to: target)
    }

    /// **La photo qui part** : le même graphe, rendu dans l'espace de la photo (#9327),
    /// à la résolution native de la source quand `canvas` est `nil`.
    static func photo(_ image: CGImage, look: ComposerPhotoLook, framing: ComposerFraming,
                      scene: CallLiveFrameScene?, canvas: CGSize? = nil) -> CGImage? {
        let toile = canvas ?? Self.canvas(for: CGSize(width: image.width, height: image.height))
        let espace = ComposerPhotoLookRule.colorSpace(of: image)
        let peinte = paint(CIImage(cgImage: image), look: look, framing: framing, scene: scene,
                           canvas: toile, declared: espace)
        return ComposerLookGPU.context.createCGImage(peinte, from: CGRect(origin: .zero, size: toile),
                                                     format: .RGBA8, colorSpace: espace)
    }

    /// L'écran montre le canevas par UNE transformation d'ajustement.
    static func onScreen(_ painted: CIImage, canvas: CGSize, drawable: CGSize) -> CIImage {
        painted.transformed(by: ComposerLiveLookRule.fit(scene: canvas, into: drawable))
    }

    /// La photo à sa résolution native, hors du fil principal. Sa scène est cuite à
    /// cette taille et relâchée aussitôt — jamais retenue par le cache, borné pour
    /// l'aperçu. Un cadre qui ne se peint pas rend `nil` plutôt qu'une photo sans le
    /// cadre que l'auteur voyait.
    @concurrent
    static func renderPhoto(_ image: CGImage, look: ComposerPhotoLook, framing: ComposerFraming,
                            person: CallFramePerson, date: Date,
                            scenes: any ComposerLookSceneProviding) async -> CGImage? {
        let toile = canvas(for: CGSize(width: image.width, height: image.height))
        let cle = ComposerLookSceneKey(look: look, canvas: toile, date: date, person: person)
        let scene = scenes.cached(cle) ?? Self.scene(for: cle)
        if look.frame != ComposerPhotoFrame.none, scene == nil { return nil }
        guard !Task.isCancelled else { return nil }
        return photo(image, look: look, framing: framing, scene: scene, canvas: toile)
    }

    /// **L'aperçu d'une prise** : le même graphe, à la toile de l'écran
    /// (`designCanvas`), jamais à la définition de la prise — un changement de look
    /// coûte une image d'écran, pas une photo de 12 Mpx. Une tâche annulée (un autre
    /// look a été choisi entre-temps) s'arrête avant de peindre.
    @concurrent
    static func renderPreview(_ image: CGImage, look: ComposerPhotoLook, framing: ComposerFraming,
                              person: CallFramePerson, date: Date,
                              scenes: any ComposerLookSceneProviding) async -> CGImage? {
        guard !Task.isCancelled else { return nil }
        let cle = ComposerLookSceneKey(look: look, canvas: designCanvas, date: date, person: person)
        let scene = scenes.cached(cle) ?? Self.scene(for: cle)
        if look.frame != ComposerPhotoFrame.none, scene == nil { return nil }
        guard !Task.isCancelled else { return nil }
        return photo(image, look: look, framing: framing, scene: scene, canvas: designCanvas)
    }
}
