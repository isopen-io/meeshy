import CoreGraphics
import CoreImage
import Foundation
import MeeshyUI
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

/// **Ce que la retouche pose sur la prise** (#12591, #12602, #12753) : des couches, dans l'ordre
/// des textes (z croissant). Une couche d'ENCRE pose des textes (glyphes, fonds, liserés, teinte du
/// verre) ; une couche de VERRE floute tout ce qui est déjà peint sous sa vitre — la prise ET l'encre
/// des textes inférieurs, comme le verre du composer. L'aperçu ne remet que les vitres : le canvas de
/// la retouche peint l'encre lui-même.
nonisolated struct ComposerTextOverlay: Equatable, Sendable {
    enum Layer: Sendable {
        case ink(CGImage)
        case glass(StoryGlassPane)
    }

    let layers: [Layer]

    init(layers: [Layer]) {
        self.layers = layers
    }

    /// Les vitres d'abord, l'encre au-dessus : des textes qui ne se chevauchent pas.
    init(ink: CGImage?, glass: [StoryGlassPane] = []) {
        self.init(layers: glass.map(Layer.glass) + (ink.map { [Layer.ink($0)] } ?? []))
    }

    var ink: CGImage? {
        layers.lazy.compactMap { if case .ink(let image) = $0 { return image } else { return nil } }.first
    }

    var glass: [StoryGlassPane] {
        layers.compactMap { if case .glass(let pane) = $0 { return pane } else { return nil } }
    }

    /// Deux calques sont les mêmes quand ils portent les MÊMES bitmaps, dans le même ordre :
    /// l'aperçu ne se repeint qu'à une nouvelle cuisson.
    static func == (lhs: Self, rhs: Self) -> Bool {
        lhs.layers.count == rhs.layers.count && zip(lhs.layers, rhs.layers).allSatisfy(Self.same)
    }

    private static func same(_ a: Layer, _ b: Layer) -> Bool {
        switch (a, b) {
        case (.ink(let x), .ink(let y)): return x === y
        case (.glass(let x), .glass(let y)): return x.mask === y.mask && x.sigma == y.sigma && x.bounds == y.bounds
        default: return false
        }
    }
}

/// **Le processeur graphique de la capture, partagé** (spec § 5) : un seul
/// `CIContext` Metal pour l'aperçu, la bande, la boucle et la photo.
nonisolated enum ComposerLookGPU {
    static let device: MTLDevice? = MTLCreateSystemDefaultDevice()
    static let commandQueue: MTLCommandQueue? = device?.makeCommandQueue()
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

    /// Le REPÈRE de dessin : 9:16, 1080×1920 — les proportions d'une carte, et la
    /// borne de la toile de l'aperçu ; ce qui PART se peint à `canvas(for:aspect:)`.
    static let designCanvas = CGSize(width: 1080, height: 1920)
    static let designAspect = designCanvas.width / designCanvas.height
    /// La toile d'une miniature de la bande.
    static let thumbnailCanvas = CGSize(width: 162, height: 288)

    /// **Les proportions de ce que le viseur montre** (#9557) : le plein écran est
    /// le plein écran, la toile le suit. Arrondies au millième — une carte 9:16
    /// mesurée au demi-point près reste le 9:16 exact, et deux mesures voisines
    /// ne cuisent pas deux scènes.
    static func aspect(of view: CGSize) -> CGFloat {
        guard view.width > 0, view.height > 0 else { return designAspect }
        let mesure = ((view.width / view.height) * 1000).rounded() / 1000
        return abs(mesure - designAspect) < 0.002 ? designAspect : mesure
    }

    /// **La toile de l'aperçu** : la plus grande aux proportions du viseur qui
    /// tienne dans le repère — jamais plus de pixels que le 9:16 d'origine.
    static func previewCanvas(aspect: CGFloat) -> CGSize {
        canvas(for: designCanvas, aspect: aspect)
    }

    /// **Le canevas qui part : le plus grand recadrage de la source aux
    /// proportions du viseur**, à sa résolution native, jamais réduit (décision
    /// porteur 2026-10-04, proportions du 2026-10-07 — #9557). En 9:16, des
    /// multiples PAIRS de 9 × 16 : proportion exacte ; ailleurs, des dimensions
    /// paires au plus près (encodeurs).
    static func canvas(for source: CGSize, aspect: CGFloat = designAspect) -> CGSize {
        guard aspect > 0, aspect != designAspect else {
            let pas = Int(min(source.width / 9, source.height / 16).rounded(.down))
            let pair = max(2, pas - pas % 2)
            return CGSize(width: 9 * pair, height: 16 * pair)
        }
        let hauteur = even(min(source.height, source.width / aspect))
        return CGSize(width: min(even(source.width), even(hauteur * aspect)), height: hauteur)
    }

    private static func even(_ value: CGFloat) -> CGFloat {
        let entier = Int(value.rounded(.down))
        return CGFloat(max(2, entier - entier % 2))
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
    /// L'effet de l'appel (#10311) se pose sur la source tonifiée, avant le
    /// cadrage : le visage se lit là où il est. `still` : une photo, dont le
    /// visage se cherche sur elle ; `faces` : le suivi d'un aperçu ou d'un export.
    /// Les étages sont ceux du peintre de lens unique (#11298) : étalonnage,
    /// effet du visage, puis cadrage et cadre.
    ///
    /// `overlay` : ce qui se pose AU-DESSUS du cadre, à l'étage `.overlays` — le texte de la
    /// retouche (#12591), la prise floutée sous ses vitres d'abord (#12602). Mis à l'échelle de la
    /// toile ; `nil` ⇒ le graphe d'avant, inchangé.
    static func paint(_ source: CIImage, look: ComposerPhotoLook, framing: ComposerFraming,
                      scene: CallLiveFrameScene?, canvas: CGSize, declared: CGColorSpace? = nil,
                      faces: ComposerFaceEffects = .live, still: Bool = false, overlay: ComposerTextOverlay? = nil) -> CIImage {
        let couches = [
            LensPass(.lut) { image, _ in ComposerLiveLookRule.graded(image, filter: look.filter, declared: declared) },
            LensPass(.face) { tonifiee, _ in faces.apply(look.effect, to: tonifiee, probing: source, still: still) },
            LensPass(.frame) { image, _ in framed(image, framing: framing, scene: scene, canvas: canvas) },
        ] + overlayPasses(overlay, canvas: canvas)
        return LensPainter.paint(source, passes: couches, input: LensFrameInput())
    }

    private static func overlayPasses(_ overlay: ComposerTextOverlay?, canvas: CGSize) -> [LensPass] {
        guard let overlay else { return [] }
        let vitres = overlay.glass.compactMap { frosted($0, canvas: canvas) }
        let encre = overlay.ink.flatMap { posed(CIImage(cgImage: $0), canvas: canvas) }
        return vitres + (encre.map { [LensPass.overlay($0, stage: .overlays)] } ?? [])
    }

    /// Un calque mis à l'échelle de la toile.
    private static func posed(_ calque: CIImage, canvas: CGSize) -> CIImage? {
        guard let pose = pose(calque.extent, canvas: canvas) else { return nil }
        return calque.transformed(by: pose)
    }

    private static func pose(_ etendue: CGRect, canvas: CGSize) -> CGAffineTransform? {
        guard etendue.width > 0, etendue.height > 0 else { return nil }
        return CGAffineTransform(translationX: -etendue.minX, y: -etendue.minY)
            .concatenating(CGAffineTransform(scaleX: canvas.width / etendue.width, y: canvas.height / etendue.height))
    }

    /// Une vitre : sa découpe recadrée sur sa boîte (le flou ne se calcule que là), mise à
    /// l'échelle de la toile avec son flou. La boîte a son origine en haut, Core Image en bas.
    private static func frosted(_ vitre: StoryGlassPane, canvas: CGSize) -> LensPass? {
        let masque = CIImage(cgImage: vitre.mask)
        guard let pose = pose(masque.extent, canvas: canvas) else { return nil }
        let boite = CGRect(x: vitre.bounds.minX, y: masque.extent.height - vitre.bounds.maxY,
                           width: vitre.bounds.width, height: vitre.bounds.height)
        let echelle = canvas.width / masque.extent.width
        return .frosted(under: masque.cropped(to: boite).transformed(by: pose), sigma: vitre.sigma * echelle, stage: .overlays)
    }

    /// Le cadrage, puis la case du cadre quand la scène en a une.
    private static func framed(_ graded: CIImage, framing: ComposerFraming,
                               scene: CallLiveFrameScene?, canvas: CGSize) -> CIImage {
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
                      scene: CallLiveFrameScene?, canvas: CGSize? = nil, overlay: ComposerTextOverlay? = nil) -> CGImage? {
        let toile = canvas ?? Self.canvas(for: CGSize(width: image.width, height: image.height))
        let espace = ComposerPhotoLookRule.colorSpace(of: image)
        let peinte = paint(CIImage(cgImage: image), look: look, framing: framing, scene: scene,
                           canvas: toile, declared: espace, still: true, overlay: overlay)
        return ComposerLookGPU.context.createCGImage(peinte, from: CGRect(origin: .zero, size: toile),
                                                     format: .RGBA8, colorSpace: espace)
    }

    /// L'écran montre le canevas par UNE transformation. La toile a les
    /// proportions du viseur à un pixel pair près : elle le couvre bord à bord,
    /// sans liseré ; une toile d'autres proportions s'y ajuste, entière.
    static func onScreen(_ painted: CIImage, canvas: CGSize, drawable: CGSize) -> CIImage {
        guard canvas.width > 0, canvas.height > 0, drawable.width > 0, drawable.height > 0 else { return painted }
        let ecart = abs(canvas.width / canvas.height - drawable.width / drawable.height)
        guard ecart < 0.01 else {
            return painted.transformed(by: ComposerLiveLookRule.fit(scene: canvas, into: drawable))
        }
        return painted.transformed(by: CGAffineTransform(scaleX: drawable.width / canvas.width,
                                                         y: drawable.height / canvas.height))
    }

    /// La photo à sa résolution native, hors du fil principal. Sa scène est cuite à
    /// cette taille et relâchée aussitôt — jamais retenue par le cache, borné pour
    /// l'aperçu. Un cadre qui ne se peint pas rend `nil` plutôt qu'une photo sans le
    /// cadre que l'auteur voyait.
    @concurrent
    static func renderPhoto(_ image: CGImage, look: ComposerPhotoLook, framing: ComposerFraming,
                            aspect: CGFloat = designAspect, person: CallFramePerson, date: Date,
                            scenes: any ComposerLookSceneProviding, overlay: ComposerTextOverlay? = nil) async -> CGImage? {
        let toile = canvas(for: CGSize(width: image.width, height: image.height), aspect: aspect)
        let cle = ComposerLookSceneKey(look: look, canvas: toile, date: date, person: person)
        let scene = scenes.cached(cle) ?? Self.scene(for: cle)
        if look.frame != ComposerPhotoFrame.none, scene == nil { return nil }
        guard !Task.isCancelled else { return nil }
        return photo(image, look: look, framing: framing, scene: scene, canvas: toile, overlay: overlay)
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

    /// Les proportions de la case où le média se pose : la découpe du cadre, la toile du viseur
    /// sinon. La scène de l'aperçu sert si elle est cuite ; sinon une toile de sonde, aux mêmes
    /// proportions et de la taille d'une miniature (une milliseconde), se cuit ici — un cache froid
    /// ne doit jamais faire cadrer plein viseur un média qui part dans une case 4:5.
    static func framingAspect(look: ComposerPhotoLook, neutral: CGFloat, date: Date, person: CallFramePerson,
                              scenes: any ComposerLookSceneProviding) -> CGFloat {
        guard look.frame != ComposerPhotoFrame.none else { return neutral }
        let sonde = canvas(for: thumbnailCanvas, aspect: neutral)
        let cles = [previewCanvas(aspect: neutral), sonde].map {
            ComposerLookSceneKey(look: look, canvas: $0, date: date, person: person)
        }
        let scene = cles.lazy.compactMap { scenes.cached($0) }.first ?? Self.scene(for: cles[1])
        guard let photo = scene?.slots.first?.photo, photo.height > 0 else { return neutral }
        return photo.width / photo.height
    }
}
