import XCTest
import CoreImage
@testable import Meeshy

/// **Les classiques en couches** (#9348, spec § 4.2) : chaque style se cuit en
/// scène, et la scène composée sur le GPU rend ce que le peintre CPU rendait.
@MainActor
final class CallMontageLayersTests: XCTestCase {

    private let personne = CallFramePerson(id: "moi", name: "Ada", handle: "ada", isSelf: true)
    private let legende = CallMontageCaption(title: "Meeshy", subtitle: "4 oct. 2026")
    private let toile = CGSize(width: 108, height: 192)

    func test_layers_everyClassicStyle_producesASceneWithOneSlot() {
        for style in CallMontageStyle.allCases {
            let scene = CallMontageRenderer.layers(style: style, person: personne, caption: legende, size: toile)
            XCTAssertNotNil(scene, "\(style) se découpe en couches")
            XCTAssertEqual(scene?.slots.count, 1, "\(style) : une personne, une découpe")
            XCTAssertNotNil(scene?.slots.first?.placement, "\(style) : la case se pose par la transformation relevée")
        }
    }

    func test_layers_maskIsAPatchAroundTheHole_notTheWholeCanvas() throws {
        let scene = try XCTUnwrap(CallMontageRenderer.layers(style: .polaroid, person: personne,
                                                             caption: legende, size: toile))
        let masque = try XCTUnwrap(scene.slots.first?.mask)
        XCTAssertTrue(CGRect(origin: .zero, size: toile).contains(masque.extent))
        XCTAssertLessThan(masque.extent.width * masque.extent.height, toile.width * toile.height * 0.8,
                          "une photo pleine définition ne cuit pas un masque de la taille de la toile")
    }

    func test_layers_composedOnGPU_isOpaqueAndMatchesTheCPURenderInsideTheSlot() throws {
        let photo = Self.photo()
        let contexte = Self.contexte()
        let mesures: [(CallMontageStyle, Double, Int)] = try CallMontageStyle.allCases.map { style in
            let cpu = try XCTUnwrap(CallMontageRenderer.render(
                style: style,
                portraits: [CallMontagePortrait(id: personne.id, name: personne.name, image: photo)],
                canvas: toile, caption: legende))
            let scene = try XCTUnwrap(CallMontageRenderer.layers(style: style, person: personne,
                                                                 caption: legende, size: toile))
            let gpu = CallLiveFrameCompositor().compose(scene, videos: [personne.id: CIImage(cgImage: photo)])
            let a = Self.rgba(CIImage(cgImage: cpu), size: toile, context: contexte)
            let b = Self.rgba(gpu, size: toile, context: contexte)
            let masque = Self.rgba(try XCTUnwrap(scene.slots.first?.mask), size: toile, context: contexte)
            return (style, Self.slotGap(a, b, mask: masque), Self.translucentPixels(b))
        }
        let releve = mesures.map { "\($0.0.rawValue)=\(String(format: "%.4f", $0.1))" }.joined(separator: " ")
        for (style, ecart, translucides) in mesures {
            XCTAssertEqual(translucides, 0, "\(style) : aucun liseré translucide au bord de la case")
            XCTAssertLessThan(ecart, 0.035, "\(style) : écart moyen \(ecart) dans la case — \(releve)")
        }
    }

    func test_painterPhoto_classicPolaroid_matchesTheCPURenderInsideTheTiltedSlot() throws {
        let photo = Self.photo()
        let date = Date(timeIntervalSince1970: 1_790_000_000)
        let look = ComposerPhotoLook(frame: .montage(.classic(.polaroid)))
        let scene = try XCTUnwrap(ComposerLookPainter.scene(for: look, canvas: toile, date: date, person: personne))
        let peinte = try XCTUnwrap(ComposerLookPainter.photo(photo, look: look, framing: .identity,
                                                             scene: scene, canvas: toile))
        let cpu = try XCTUnwrap(CallMontageRenderer.render(
            style: .polaroid, portraits: [CallMontagePortrait(id: personne.id, name: personne.name, image: photo)],
            canvas: toile, caption: ComposerPhotoLookSource.caption(at: date)))
        let contexte = Self.contexte()
        let a = Self.rgba(CIImage(cgImage: cpu), size: toile, context: contexte)
        let b = Self.rgba(CIImage(cgImage: peinte), size: toile, context: contexte)
        let masque = Self.rgba(try XCTUnwrap(scene.slots.first?.mask), size: toile, context: contexte)
        let ecart = Self.slotGap(a, b, mask: masque)
        XCTAssertLessThan(ecart, 0.035, "la photo qui part pose la prise dans la polaroïd inclinée comme le Montage")
        XCTAssertEqual(Self.translucentPixels(b), 0)
    }

    func test_placed_rotatedSlot_sendsTheSourceCornersToTheTiltedCorners() {
        let source = CGRect(x: 0, y: 0, width: 300, height: 400)
        let photo = CGRect(x: 20, y: 30, width: 60, height: 80)
        let centre = CGPoint(x: 55, y: 75)
        let angle = -3 * CGFloat.pi / 180
        let rotation = CGAffineTransform(translationX: -centre.x, y: -centre.y)
            .concatenating(CGAffineTransform(rotationAngle: angle))
            .concatenating(CGAffineTransform(translationX: centre.x, y: centre.y))
        let pose = CallLiveFrameGeometry.placed(
            source: source, photo: photo,
            toCanvas: rotation.concatenating(CallMontageRenderer.coreImage(canvasHeight: 192)))
        let attendu: (CGPoint) -> CGPoint = { (coin: CGPoint) -> CGPoint in
            let dx: CGFloat = coin.x - centre.x
            let dy: CGFloat = coin.y - centre.y
            let x: CGFloat = centre.x + dx * cos(angle) - dy * sin(angle)
            let y: CGFloat = centre.y + dx * sin(angle) + dy * cos(angle)
            return CGPoint(x: x, y: 192 - y)
        }
        let hautGauche = CGPoint(x: 0, y: 400).applying(pose)
        let basDroite = CGPoint(x: 300, y: 0).applying(pose)
        XCTAssertEqual(hautGauche.x, attendu(CGPoint(x: 20, y: 30)).x, accuracy: 1e-6)
        XCTAssertEqual(hautGauche.y, attendu(CGPoint(x: 20, y: 30)).y, accuracy: 1e-6,
                       "le haut de la prise reste en haut de la case inclinée")
        XCTAssertEqual(basDroite.x, attendu(CGPoint(x: 80, y: 110)).x, accuracy: 1e-6)
        XCTAssertEqual(basDroite.y, attendu(CGPoint(x: 80, y: 110)).y, accuracy: 1e-6)
    }

    func test_render_withoutHole_paintsThePhotoForCalls() throws {
        let photo = Self.photo()
        let contexte = Self.contexte()
        for style in CallMontageStyle.allCases {
            let rendu = try XCTUnwrap(CallMontageRenderer.render(
                style: style, portraits: [CallMontagePortrait(id: "a", name: "A", image: photo)],
                canvas: toile, caption: legende))
            XCTAssertEqual(rendu.width, 108)
            let pixels = Self.rgba(CIImage(cgImage: rendu), size: toile, context: contexte)
            XCTAssertEqual(Self.translucentPixels(pixels), 0, "\(style) : un appel peint la photo, jamais un trou")
        }
        let noir = try XCTUnwrap(CallMontageRenderer.render(
            style: .noir, portraits: [CallMontagePortrait(id: "a", name: "A", image: photo)],
            canvas: toile, caption: legende))
        let pixels = Self.rgba(CIImage(cgImage: noir), size: toile, context: contexte)
        let scene = try XCTUnwrap(CallMontageRenderer.layers(style: .noir, person: personne, caption: legende, size: toile))
        let masque = Self.rgba(try XCTUnwrap(scene.slots.first?.mask), size: toile, context: contexte)
        let interieur = Self.interior(masque, width: Int(toile.width), erosion: 4)
        XCTAssertGreaterThan(interieur.count, 100)
        XCTAssertEqual(Self.colouredPixels(pixels, at: interieur), 0, "noir désature la photo de l'appel : aucun pixel coloré")
    }

    // MARK: - Écran et Mosaïque d'une photo seule (#12589)

    func test_render_screenAlone_cornerIsBezel_centreIsPhoto_bandIsLight() throws {
        let canvas = CGSize(width: 216, height: 384)
        let rendu = try XCTUnwrap(CallMontageRenderer.render(
            style: .screen, portraits: [CallMontagePortrait(id: "a", name: "A", image: Self.photoSombre())],
            canvas: canvas, caption: CallMontageCaption(title: "Meeshy", subtitle: "", clock: "09:41")))
        let pixels = Self.rgba(CIImage(cgImage: rendu), size: canvas, context: Self.contexte())
        let coin = Self.pixelAt(pixels, x: 1, y: 1, width: 216)
        XCTAssertLessThan(coin.0 + coin.1 + coin.2, 30, "le coin est le bord de l'appareil, noir")
        let bord = Self.pixelAt(pixels, x: 2, y: 192, width: 216)
        XCTAssertLessThan(bord.0, 30, "les 3 % de bord noir courent sur toute la hauteur")
        let centre = Self.pixelAt(pixels, x: 108, y: 200, width: 216)
        XCTAssertEqual(Int(centre.0), 51, accuracy: 6, "le centre est la photo, un gris 0,2")
        let barre = CallMontageSoloLayout.screen(in: CGRect(origin: .zero, size: canvas)).statusBand
        let claires = Self.lightPixels(pixels, in: barre, width: 216)
        XCTAssertGreaterThan(claires, 6, "l'heure et la signature s'écrivent en clair dans la barre d'état")
    }

    func test_render_screenAlone_reflectionLightensThePhotoInsideItsPolygon() throws {
        let canvas = CGSize(width: 216, height: 384)
        let rendu = try XCTUnwrap(CallMontageRenderer.render(
            style: .screen, portraits: [CallMontagePortrait(id: "a", name: "A", image: Self.photoSombre())],
            canvas: canvas, caption: legende))
        let pixels = Self.rgba(CIImage(cgImage: rendu), size: canvas, context: Self.contexte())
        let reflet = CallMontageSoloLayout.screen(in: CGRect(origin: .zero, size: canvas)).reflection
        let cx = reflet.map(\.x).reduce(0, +) / CGFloat(reflet.count)
        let cy = reflet.map(\.y).reduce(0, +) / CGFloat(reflet.count)
        let dedans = Self.pixelAt(pixels, x: Int(cx), y: Int(cy), width: 216)
        let dehors = Self.pixelAt(pixels, x: 170, y: 250, width: 216)
        XCTAssertGreaterThan(Int(dedans.0), Int(dehors.0) + 6, "le reflet éclaircit l'écran de 6 %")
    }

    func test_render_gridAlone_jointPixelsAreLight() throws {
        let canvas = CGSize(width: 432, height: 768)
        let rendu = try XCTUnwrap(CallMontageRenderer.render(
            style: .grid, portraits: [CallMontagePortrait(id: "a", name: "A", image: Self.photoSombre())],
            canvas: canvas, caption: legende))
        let pixels = Self.rgba(CIImage(cgImage: rendu), size: canvas, context: Self.contexte())
        let mosaique = CallMontageSoloLayout.mosaic(in: CGRect(origin: .zero, size: canvas))
        let joint = Self.pixelAt(pixels, x: Int(mosaique.tiles[0].maxX + mosaique.joint / 2),
                                 y: Int(mosaique.tiles[0].midY), width: 432)
        XCTAssertGreaterThan(Int(joint.0), 190, "le joint entre deux carreaux est blanc")
        let carreau = Self.pixelAt(pixels, x: Int(mosaique.tiles[4].midX), y: Int(mosaique.tiles[4].midY), width: 432)
        XCTAssertLessThan(Int(carreau.0), 90, "le carreau reste la photo, à une teinte près")
        let rangee = Self.pixelAt(pixels, x: Int(mosaique.tiles[4].midX), y: Int(mosaique.tiles[0].maxY + mosaique.joint / 2), width: 432)
        XCTAssertGreaterThan(Int(rangee.0), 190, "le joint entre deux rangées aussi")
        XCTAssertGreaterThan(Self.lightPixels(pixels, in: mosaique.band, width: 432), 20, "la signature se lit dans la bande basse")
    }

    func test_layers_screenAndGridSolo_paintAtEveryAspect() throws {
        let toiles = [CGSize(width: 150, height: 200), CGSize(width: 108, height: 192), CGSize(width: 160, height: 200),
                      CGSize(width: 160, height: 160), CGSize(width: 192, height: 108)]
        let photo = Self.photo()
        let contexte = Self.contexte()
        for style in [CallMontageStyle.screen, .grid] {
            for taille in toiles {
                let scene = try XCTUnwrap(CallMontageRenderer.layers(style: style, person: personne, caption: legende, size: taille),
                                          "\(style) \(taille)")
                XCTAssertEqual(scene.slots.count, 1)
                let gpu = CallLiveFrameCompositor().compose(scene, videos: [personne.id: CIImage(cgImage: photo)])
                let pixels = Self.rgba(gpu, size: taille, context: contexte)
                XCTAssertEqual(Self.translucentPixels(pixels), 0, "\(style) \(taille) : composée, la toile est pleine")
                let cpu = try XCTUnwrap(CallMontageRenderer.render(
                    style: style, portraits: [CallMontagePortrait(id: personne.id, name: personne.name, image: photo)],
                    canvas: taille, caption: legende))
                let masque = Self.rgba(try XCTUnwrap(scene.slots.first?.mask), size: taille, context: contexte)
                let ecart = Self.slotGap(Self.rgba(CIImage(cgImage: cpu), size: taille, context: contexte), pixels, mask: masque)
                XCTAssertLessThan(ecart, 0.05, "\(style) \(taille) : la couche et le rendu direct se superposent")
            }
        }
    }

    func test_tone_noirIsLuminosity_othersInColor() {
        XCTAssertEqual(CallMontageRenderer.tone(of: .noir), .luminosity)
        XCTAssertEqual(CallMontageRenderer.tone(of: .polaroid), .color)
    }

    // MARK: - Outils

    static func contexte() -> CIContext {
        CIContext(options: [.workingColorSpace: CGColorSpaceCreateDeviceRGB()])
    }

    static func photoSombre() -> CGImage {
        let contexte = CGContext(data: nil, width: 300, height: 400, bitsPerComponent: 8, bytesPerRow: 0,
                                 space: CGColorSpaceCreateDeviceRGB(),
                                 bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)!
        contexte.setFillColor(CGColor(gray: 0.2, alpha: 1))
        contexte.fill(CGRect(x: 0, y: 0, width: 300, height: 400))
        return contexte.makeImage()!
    }

    static func pixelAt(_ pixels: [UInt8], x: Int, y: Int, width: Int) -> (UInt8, UInt8, UInt8) {
        let i = (y * width + x) * 4
        return (pixels[i], pixels[i + 1], pixels[i + 2])
    }

    /// Les pixels presque blancs d'une zone : ce que l'écriture claire laisse sur un fond sombre.
    static func lightPixels(_ pixels: [UInt8], in rect: CGRect, width: Int) -> Int {
        let hauteur = pixels.count / 4 / width
        let zone = rect.integral.intersection(CGRect(x: 0, y: 0, width: width, height: hauteur))
        guard !zone.isNull else { return 0 }
        return (Int(zone.minY) ..< Int(zone.maxY)).reduce(0) { total, y in
            total + (Int(zone.minX) ..< Int(zone.maxX)).filter { x in
                let p = pixelAt(pixels, x: x, y: y, width: width)
                return p.0 > 200 && p.1 > 200 && p.2 > 200
            }.count
        }
    }

    static func photo() -> CGImage {
        let contexte = CGContext(data: nil, width: 300, height: 400, bitsPerComponent: 8, bytesPerRow: 0,
                                 space: CGColorSpaceCreateDeviceRGB(),
                                 bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)!
        contexte.setFillColor(CGColor(red: 0.9, green: 0.2, blue: 0.1, alpha: 1))
        contexte.fill(CGRect(x: 0, y: 0, width: 150, height: 400))
        contexte.setFillColor(CGColor(red: 0.1, green: 0.3, blue: 0.9, alpha: 1))
        contexte.fill(CGRect(x: 150, y: 0, width: 150, height: 200))
        contexte.setFillColor(CGColor(red: 0.2, green: 0.8, blue: 0.3, alpha: 1))
        contexte.fill(CGRect(x: 150, y: 200, width: 150, height: 200))
        return contexte.makeImage()!
    }

    /// L'écart moyen RVB, sur les seuls pixels où la case couvre au moins la moitié.
    static func slotGap(_ a: [UInt8], _ b: [UInt8], mask: [UInt8]) -> Double {
        let fin: Int = min(a.count, b.count, mask.count)
        let pixels: [Int] = stride(from: 0, to: fin, by: 4).filter { (i: Int) -> Bool in mask[i + 3] >= 128 }
        let somme: Double = pixels.reduce(0.0) { (total: Double, i: Int) -> Double in
            let r = abs(Double(a[i]) - Double(b[i]))
            let v = abs(Double(a[i + 1]) - Double(b[i + 1]))
            let bleu = abs(Double(a[i + 2]) - Double(b[i + 2]))
            return total + r + v + bleu
        }
        return pixels.isEmpty ? 1 : somme / Double(pixels.count * 3) / 255
    }

    static func colouredPixels(_ pixels: [UInt8], at indices: [Int]) -> Int {
        indices.filter { (i: Int) -> Bool in
            let rouge = Int(pixels[i])
            let vert = Int(pixels[i + 1])
            let bleu = Int(pixels[i + 2])
            return abs(rouge - vert) > 3 || abs(vert - bleu) > 3
        }.count
    }

    /// Les pixels pleins de la case, loin de son bord : ceux dont les voisins à
    /// `erosion` pixels sont pleins aussi.
    static func interior(_ mask: [UInt8], width: Int, erosion: Int) -> [Int] {
        let total: Int = mask.count / 4
        let plein: (Int) -> Bool = { (p: Int) -> Bool in p >= 0 && p < total && mask[p * 4 + 3] == 255 }
        return (0 ..< total).filter { (p: Int) -> Bool in
            let x: Int = p % width
            guard x >= erosion, x < width - erosion else { return false }
            let voisins: [Int] = [p, p - erosion, p + erosion, p - erosion * width, p + erosion * width]
            return voisins.allSatisfy(plein)
        }.map { (p: Int) -> Int in p * 4 }
    }

    static func translucentPixels(_ pixels: [UInt8]) -> Int {
        stride(from: 3, to: pixels.count, by: 4).filter { (i: Int) -> Bool in pixels[i] != 255 }.count
    }

    static func rgba(_ image: CIImage, size: CGSize, context: CIContext) -> [UInt8] {
        let largeur = Int(size.width), hauteur = Int(size.height)
        var octets = [UInt8](repeating: 0, count: largeur * hauteur * 4)
        context.render(image, toBitmap: &octets, rowBytes: largeur * 4, bounds: CGRect(origin: .zero, size: size),
                       format: .RGBA8, colorSpace: CGColorSpaceCreateDeviceRGB())
        return octets
    }
}
