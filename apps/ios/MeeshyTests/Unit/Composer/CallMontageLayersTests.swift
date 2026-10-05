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
        let attendu: (CGPoint) -> CGPoint = { coin in
            let d = CGPoint(x: coin.x - centre.x, y: coin.y - centre.y)
            let tourne = CGPoint(x: centre.x + d.x * cos(angle) - d.y * sin(angle),
                                 y: centre.y + d.x * sin(angle) + d.y * cos(angle))
            return CGPoint(x: tourne.x, y: 192 - tourne.y)
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
        let colores = stride(from: 0, to: pixels.count, by: 4).filter { i in
            abs(Int(pixels[i]) - Int(pixels[i + 1])) > 3 || abs(Int(pixels[i + 1]) - Int(pixels[i + 2])) > 3
        }
        XCTAssertEqual(colores.count, 0, "noir désature la photo de l'appel : aucun pixel coloré")
    }

    func test_tone_noirIsLuminosity_othersInColor() {
        XCTAssertEqual(CallMontageRenderer.tone(of: .noir), .luminosity)
        XCTAssertEqual(CallMontageRenderer.tone(of: .polaroid), .color)
    }

    // MARK: - Outils

    static func contexte() -> CIContext {
        CIContext(options: [.workingColorSpace: CGColorSpaceCreateDeviceRGB()])
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
        let pixels = stride(from: 0, to: min(a.count, b.count, mask.count), by: 4).filter { mask[$0 + 3] >= 128 }
        let somme: Double = pixels.reduce(0.0) { (total: Double, i: Int) -> Double in
            let r = abs(Double(a[i]) - Double(b[i]))
            let v = abs(Double(a[i + 1]) - Double(b[i + 1]))
            let bleu = abs(Double(a[i + 2]) - Double(b[i + 2]))
            return total + r + v + bleu
        }
        return pixels.isEmpty ? 1 : somme / Double(pixels.count * 3) / 255
    }

    static func translucentPixels(_ pixels: [UInt8]) -> Int {
        stride(from: 3, to: pixels.count, by: 4).filter { pixels[$0] != 255 }.count
    }

    static func rgba(_ image: CIImage, size: CGSize, context: CIContext) -> [UInt8] {
        let largeur = Int(size.width), hauteur = Int(size.height)
        var octets = [UInt8](repeating: 0, count: largeur * hauteur * 4)
        context.render(image, toBitmap: &octets, rowBytes: largeur * 4, bounds: CGRect(origin: .zero, size: size),
                       format: .RGBA8, colorSpace: CGColorSpaceCreateDeviceRGB())
        return octets
    }
}
