import XCTest
import UIKit
@testable import MeeshyUI
@testable import MeeshySDK

/// **Le curseur d'un look ne cuit rien dans l'image où le doigt bouge** (#9873).
///
/// Dans le canvas INTERACTIF, un changement de rendu seul (filtre, intensité,
/// réglage) part se cuire hors du fil principal (`StoryLiveLook`) : le bitmap
/// affiché reste jusqu'au suivant, la cuisson est remise sur le MainActor, et
/// une cuisson devenue caduque (autre source, repeint synchrone) n'est jamais
/// posée. Le cache de la cuisson ne sert un bitmap qu'à SA source vivante.
@MainActor
final class StoryLookLiveRepaintTests: XCTestCase {

    // MARK: - Fabriques

    private func gris(_ niveau: CGFloat = 0.4, side: CGFloat = 16) -> UIImage {
        let format = UIGraphicsImageRendererFormat.default()
        format.scale = 1
        return UIGraphicsImageRenderer(size: CGSize(width: side, height: side), format: format).image { ctx in
            UIColor(white: niveau, alpha: 1).setFill()
            ctx.fill(CGRect(x: 0, y: 0, width: side, height: side))
        }
    }

    private func luminance(_ contents: Any?) throws -> Int {
        let image = try XCTUnwrap(contents.map { $0 as! CGImage })
        var pixel = [UInt8](repeating: 0, count: 4)
        let contexte = try XCTUnwrap(CGContext(data: &pixel, width: 1, height: 1, bitsPerComponent: 8,
                                               bytesPerRow: 4, space: CGColorSpaceCreateDeviceRGB(),
                                               bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue))
        contexte.draw(image, in: CGRect(x: -CGFloat(image.width) / 2, y: -CGFloat(image.height) / 2,
                                        width: CGFloat(image.width), height: CGFloat(image.height)))
        return (Int(pixel[0]) + Int(pixel[1]) + Int(pixel[2])) / 3
    }

    private func requete(_ image: UIImage, exposure: Float = 1.5) -> StoryLookBakeRequest {
        StoryLookBakeRequest(image: image, filter: nil, intensity: 1,
                             adjustments: ImageAdjustments(exposure: exposure), imageId: "live-\(UUID().uuidString)")
    }

    /// Les fils où la cuisson a tourné, relevés hors du MainActor.
    private final class Releve: @unchecked Sendable {
        private let verrou = NSLock()
        private var principal: [Bool] = []

        func noter(surLeFilPrincipal: Bool) {
            verrou.lock()
            principal.append(surLeFilPrincipal)
            verrou.unlock()
        }

        var fils: [Bool] {
            verrou.lock()
            defer { verrou.unlock() }
            return principal
        }
    }

    // MARK: - L'outil de cuisson

    func test_laCuisson_tourneHorsDuFilPrincipal_etSeRemetSurLeMainActor() async throws {
        let releve = Releve()
        let cuit = gris(0.9)
        let sut = StoryLiveLook(baker: { _ in
            releve.noter(surLeFilPrincipal: Thread.isMainThread)
            return cuit
        })
        var remis: [UIImage] = []
        var surLeFilPrincipal: [Bool] = []

        sut.bake(requete(gris())) { image in
            remis.append(image)
            surLeFilPrincipal.append(Thread.isMainThread)
        }

        XCTAssertTrue(remis.isEmpty, "l'appel rend la main avant toute cuisson : le geste ne l'attend pas")
        try await StoryVideoAdjustmentsRenderTests.attendre { remis.count == 1 }
        XCTAssertTrue(remis.first === cuit)
        XCTAssertEqual(releve.fils, [false], "la cuisson d'un cran ne tombe jamais sur le fil principal")
        XCTAssertEqual(surLeFilPrincipal, [true], "le bitmap cuit se pose sur le MainActor")
    }

    func test_uneCuissonCaduque_nEstJamaisRemise() async throws {
        let porte = DispatchSemaphore(value: 0)
        let releve = Releve()
        let sut = StoryLiveLook(baker: { requete in
            releve.noter(surLeFilPrincipal: Thread.isMainThread)
            porte.wait()
            return requete.image
        })
        var remis = 0

        sut.bake(requete(gris())) { _ in remis += 1 }
        try await StoryVideoAdjustmentsRenderTests.attendre { releve.fils.count == 1 }
        sut.supersede()
        porte.signal()

        try await StoryVideoAdjustmentsRenderTests.attendre { !sut.isBaking }
        XCTAssertEqual(remis, 0, "la couche a posé autre chose entre-temps : la cuisson en vol ne la recouvre pas")
    }

    func test_uneAutreSource_rendCaduqueLaCuissonDeLAncienne() async throws {
        let porte = DispatchSemaphore(value: 0)
        let releve = Releve()
        let ancienne = gris(0.2)
        let nouvelle = gris(0.8)
        let sut = StoryLiveLook(baker: { requete in
            releve.noter(surLeFilPrincipal: Thread.isMainThread)
            if requete.image === ancienne { porte.wait() }
            return requete.image
        })
        var remis: [UIImage] = []

        sut.bake(requete(ancienne)) { remis.append($0) }
        try await StoryVideoAdjustmentsRenderTests.attendre { releve.fils.count == 1 }
        sut.bake(requete(nouvelle)) { remis.append($0) }
        porte.signal()

        try await StoryVideoAdjustmentsRenderTests.attendre { !sut.isBaking }
        XCTAssertEqual(remis.count, 1)
        XCTAssertTrue(remis.first === nouvelle, "le look de l'ancienne image ne recouvre jamais la nouvelle")
    }

    // MARK: - Le fond du canvas interactif

    private let geometrie = CanvasGeometry(renderSize: CGSize(width: 90, height: 160))

    private func configurer(_ layer: StoryBackgroundLayer, _ image: UIImage, _ reglages: ImageAdjustments?) {
        layer.configure(kind: .image(postMediaId: "file:///tmp/FONDLIVE.jpg", thumbHash: nil), transform: .identity,
                        geometry: geometrie, resolver: nil,
                        imageCache: ComposerImageCacheReader(images: ["FONDLIVE": image], version: 1),
                        filter: nil, filterIntensity: 1, adjustments: reglages, contentVersion: 1)
    }

    func test_leFondInteractif_garde_sonBitmap_pendantQueLeLookCuit() async throws {
        let image = gris()
        let layer = StoryBackgroundLayer()
        layer.bakesLookOffMainThread = true
        configurer(layer, image, nil)

        configurer(layer, image, ImageAdjustments(exposure: 1.5))

        XCTAssertTrue((layer.contentLayer?.contents as! CGImage) === image.cgImage!,
                      "aucune cuisson dans l'appel : le bitmap affiché reste jusqu'au suivant")
        let brut = try luminance(image.cgImage)
        try await StoryVideoAdjustmentsRenderTests.attendre {
            ((try? self.luminance(layer.contentLayer?.contents)) ?? 0) > brut + 20
        }
    }

    func test_leFondInteractif_revenuSurUnLookDejaCuit_seRepeintSurPlace() async throws {
        let image = gris()
        let layer = StoryBackgroundLayer()
        layer.bakesLookOffMainThread = true
        configurer(layer, image, nil)
        let brut = try luminance(image.cgImage)

        configurer(layer, image, ImageAdjustments(exposure: 1.5))
        try await StoryVideoAdjustmentsRenderTests.attendre {
            ((try? self.luminance(layer.contentLayer?.contents)) ?? 0) > brut + 20
        }
        let cuit = try XCTUnwrap(layer.contentLayer?.contents) as! CGImage
        configurer(layer, image, ImageAdjustments(exposure: -1.5))
        try await StoryVideoAdjustmentsRenderTests.attendre {
            ((try? self.luminance(layer.contentLayer?.contents)) ?? 255) < brut - 20
        }

        configurer(layer, image, ImageAdjustments(exposure: 1.5))
        XCTAssertTrue((layer.contentLayer?.contents as! CGImage) === cuit,
                      "un curseur qui revient sur une valeur vue se repeint dans l'appel, sans cuisson")
    }

    /// Le prefetcher du lecteur monte ses canvas en `.edit` : seul le composer
    /// (`StoryComposerCanvasView`) lève le drapeau, jamais le mode.
    func test_unCanvasEnEditionHorsDuComposer_garde_leRepeintSynchrone() {
        let canvas = StoryCanvasUIView(slide: StorySlide(), mode: .edit)
        canvas.frame = CGRect(x: 0, y: 0, width: 90, height: 160)
        canvas.layoutSubviews()
        XCTAssertFalse(canvas.backgroundLayer.bakesLookOffMainThread)
    }

    // MARK: - L'image posée du canvas interactif

    private func media(_ reglages: ImageAdjustments?) -> StoryMediaObject {
        var media = StoryMediaObject(id: "POSELIVE", kind: .image, aspectRatio: 1)
        media.adjustments = reglages
        return media
    }

    private func configurer(_ layer: StoryMediaLayer, _ image: UIImage, _ reglages: ImageAdjustments?) {
        layer.configure(with: media(reglages), geometry: geometrie, mode: .edit,
                        imageCache: ComposerImageCacheReader(images: ["POSELIVE": image], version: 1),
                        decodeTiming: .offMainActor)
    }

    func test_lImagePoseeInteractive_garde_sonBitmap_pendantQueSonLookCuit() async throws {
        let image = gris()
        let layer = StoryMediaLayer()
        configurer(layer, image, nil)
        let brut = try luminance(layer.contents)

        configurer(layer, image, ImageAdjustments(exposure: 1.5))

        XCTAssertEqual(try luminance(layer.contents), brut, "aucune cuisson dans l'appel")
        try await StoryVideoAdjustmentsRenderTests.attendre {
            ((try? self.luminance(layer.contents)) ?? 0) > brut + 20
        }
    }

    func test_uneImagePoseeRemplacee_sePoseSurPlace_sansMontrerLAncienne() throws {
        let sombre = gris(0.1)
        let claire = gris(0.9)
        let layer = StoryMediaLayer()
        configurer(layer, sombre, ImageAdjustments(contrast: 1.2))
        let avant = try luminance(layer.contents)

        configurer(layer, claire, ImageAdjustments(contrast: 1.2))

        XCTAssertGreaterThan(try luminance(layer.contents), avant + 100,
                             "une image remplacée (recadrage, retouche) ne laisse pas l'ancienne à l'écran")
    }

    // MARK: - Le cache de la cuisson

    func test_unBitmapCuit_nEstServiQuASaSourceVivante() {
        let source = gris(0.3)
        let autre = gris(0.3)
        let cuit = gris(0.7)
        let cle = "cache-\(UUID().uuidString)" as NSString

        StoryLookBake.store(cuit, for: cle, source: source, cost: 1)

        XCTAssertTrue(StoryLookBake.cached(cle, source: source) === cuit)
        XCTAssertNil(StoryLookBake.cached(cle, source: autre),
                     "une instance qui hériterait de l'adresse d'une autre ne reçoit jamais son look")
    }
}
