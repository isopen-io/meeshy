import XCTest
import AVFoundation
import CoreImage
import UIKit
@testable import MeeshyUI
@testable import MeeshySDK

/// **Le FOND d'une scène reçoit les mêmes réglages que l'image posée** (#9496).
///
/// Le fond est un `StoryMediaObject(isBackground: true)` : ses réglages vivent
/// sur le même champ (`adjustments`) et voyagent par le même transport. Ce qui
/// manquait était le RENDU — `StoryBackgroundLayer` (composer, lecteur), la
/// vignette composite et l'export ne lisaient que le filtre de slide.
/// `StoryBackgroundLook` est désormais leur fonction unique : filtre de slide,
/// puis réglages du média de fond (loi 6 : ce qu'on voit est ce qui part).
final class StoryBackgroundAdjustmentsRenderTests: XCTestCase {

    // MARK: - Fabriques

    private func fond(_ kind: StoryMediaKind, _ reglages: ImageAdjustments?, id: String = "fond",
                      url: URL? = nil) -> StoryMediaObject {
        var media = StoryMediaObject(id: id, mediaURL: url?.absoluteString, kind: kind, aspectRatio: 9.0 / 16.0,
                                     isBackground: true)
        media.adjustments = reglages
        return media
    }

    private func effets(_ medias: [StoryMediaObject], filter: StoryFilter? = nil) -> StoryEffects {
        var effets = StoryEffects()
        effets.mediaObjects = medias
        effets.filter = filter?.rawValue
        return effets
    }

    private func gris(_ niveau: CGFloat = 0.4, side: CGFloat = 16) -> UIImage {
        let format = UIGraphicsImageRendererFormat.default()
        format.scale = 1
        return UIGraphicsImageRenderer(size: CGSize(width: side, height: side), format: format).image { ctx in
            UIColor(white: niveau, alpha: 1).setFill()
            ctx.fill(CGRect(x: 0, y: 0, width: side, height: side))
        }
    }

    private func luminance(_ cg: CGImage?) throws -> Int {
        let image = try XCTUnwrap(cg)
        var pixel = [UInt8](repeating: 0, count: 4)
        let contexte = try XCTUnwrap(CGContext(data: &pixel, width: 1, height: 1, bitsPerComponent: 8,
                                               bytesPerRow: 4, space: CGColorSpaceCreateDeviceRGB(),
                                               bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue))
        contexte.draw(image, in: CGRect(x: -CGFloat(image.width) / 2, y: -CGFloat(image.height) / 2,
                                        width: CGFloat(image.width), height: CGFloat(image.height)))
        return (Int(pixel[0]) + Int(pixel[1]) + Int(pixel[2])) / 3
    }

    // MARK: - Ce que le fond PEINT

    func test_sansFond_niReglage_rienNEstPeint() {
        XCTAssertNil(StoryBackgroundLook.adjustments(for: StoryEffects()))
        XCTAssertNil(StoryBackgroundLook.adjustments(for: effets([fond(.image, nil)])))
        XCTAssertNil(StoryBackgroundLook.adjustments(for: effets([fond(.image, .neutral)])))
    }

    func test_unFondImage_peintTousSesReglages() {
        let reglages = ImageAdjustments(exposure: 0.8, sharpness: 0.5, blur: 0.3)
        XCTAssertEqual(StoryBackgroundLook.adjustments(for: effets([fond(.image, reglages)])), reglages)
    }

    /// La règle vidéo (#9169) vaut pour le fond : ni netteté ni flou.
    func test_unFondVideo_nePeintNiNetteteNiFlou() {
        let reglages = ImageAdjustments(saturation: 0.2, sharpness: 0.5, blur: 0.3)
        XCTAssertEqual(StoryBackgroundLook.adjustments(for: effets([fond(.video, reglages)])),
                       ImageAdjustments(saturation: 0.2))
        XCTAssertNil(StoryBackgroundLook.adjustments(for: effets([fond(.video, ImageAdjustments(sharpness: 1, blur: 1))])),
                     "Une charge qui ne porte que des réglages non servis ne coûte aucune composition.")
    }

    /// Les réglages d'une image POSÉE ne teintent jamais le fond.
    func test_lesReglagesDUnMediaPose_neSontPasCeuxDuFond() {
        var pose = StoryMediaObject(id: "pose", kind: .image, aspectRatio: 1)
        pose.adjustments = ImageAdjustments(exposure: 1)
        XCTAssertNil(StoryBackgroundLook.adjustments(for: effets([pose, fond(.image, nil)])))
    }

    // MARK: - Le modèle, par le ViewModel du composer

    @MainActor
    func test_reglerLeFond_ecritSurLuiSeul_etGardeLeFiltreDeSlide() {
        let vm = StoryComposerViewModel()
        var pose = StoryMediaObject(id: "pose", kind: .image, aspectRatio: 1)
        pose.adjustments = ImageAdjustments(contrast: 1.3)
        vm.currentEffects = effets([fond(.image, nil), pose], filter: .warm)

        vm.setMediaObjectAdjustment(id: "fond", .exposure, to: 0.8)

        XCTAssertEqual(vm.mediaObjectAdjustments(id: "fond")[.exposure], 0.8)
        XCTAssertEqual(vm.mediaObjectAdjustments(id: "pose"), ImageAdjustments(contrast: 1.3))
        XCTAssertEqual(vm.currentEffects.filter, StoryFilter.warm.rawValue)
        XCTAssertEqual(StoryBackgroundLook.adjustments(for: vm.currentEffects), ImageAdjustments(exposure: 0.8),
                       "Ce que le panneau écrit est ce que la couche de fond peint.")
    }

    @MainActor
    func test_unFlouPoseSurUnFondVideo_nEstPasEcrit() {
        let vm = StoryComposerViewModel()
        vm.currentEffects = effets([fond(.video, nil)])
        vm.setMediaObjectAdjustment(id: "fond", .blur, to: 0.8)
        XCTAssertNil(vm.currentEffects.resolvedBackgroundMedia?.adjustments,
                     "La règle vidéo vaut pour le fond : un flou n'a rien à faire au fil.")
    }

    // MARK: - Le bitmap du fond : filtre, PUIS réglages

    func test_sansFiltreNiReglage_leBitmapPasseTelQuel() {
        let image = gris()
        XCTAssertTrue(StoryBackgroundLook.image(image, filter: nil, intensity: 1, adjustments: nil, imageId: "f") === image)
    }

    func test_uneExpositionPositive_eclaircitLeFond() throws {
        let image = gris()
        let regle = StoryBackgroundLook.image(image, filter: nil, intensity: 1,
                                              adjustments: ImageAdjustments(exposure: 1.5), imageId: "f")
        XCTAssertGreaterThan(try luminance(regle.cgImage), try luminance(image.cgImage) + 20)
    }

    func test_lesReglages_sEnchainentApresLeFiltreDeSlide() {
        let rouge = UIGraphicsImageRenderer(size: CGSize(width: 8, height: 8)).image { ctx in
            UIColor.red.setFill(); ctx.fill(CGRect(x: 0, y: 0, width: 8, height: 8))
        }
        let filtreSeul = StoryBackgroundLook.image(rouge, filter: .warm, intensity: 1, adjustments: nil, imageId: "r")
        let filtreEtReglage = StoryBackgroundLook.image(rouge, filter: .warm, intensity: 1,
                                                        adjustments: ImageAdjustments(saturation: 0), imageId: "r")
        XCTAssertFalse(filtreSeul === rouge, "Le filtre de slide reste cuit.")
        XCTAssertFalse(filtreEtReglage === filtreSeul, "Les réglages s'ajoutent au filtre, ils ne le remplacent pas.")
    }

    // MARK: - Une trame de fond vidéo (export)

    func test_uneTrameDeFondVideo_porteLesReglagesDuFond() throws {
        let trame = CIImage(color: CIColor(red: 0.4, green: 0.4, blue: 0.4)).cropped(to: CGRect(x: 0, y: 0, width: 8, height: 8))
        let reglee = StoryBackgroundLook.videoFrame(trame, effects: effets([fond(.video, ImageAdjustments(exposure: 1.5))]))
        let contexte = CIContext()
        XCTAssertGreaterThan(try luminance(contexte.createCGImage(reglee, from: reglee.extent)),
                             try luminance(contexte.createCGImage(trame, from: trame.extent)) + 20)
        XCTAssertEqual(reglee.extent, trame.extent, "La trame garde son cadre.")
        XCTAssertTrue(StoryBackgroundLook.videoFrame(trame, effects: effets([fond(.video, nil)])) === trame,
                      "Un fond vidéo sans réglage ne coûte rien par trame.")
    }

    // MARK: - La vignette composite (couverture, ThumbHash)

    func test_laVignetteComposite_peintLesReglagesDuFond() throws {
        let image = gris()
        var slideBrute = StorySlide()
        slideBrute.effects = effets([fond(.image, nil)])
        var slideReglee = StorySlide()
        slideReglee.effects = effets([fond(.image, ImageAdjustments(exposure: 1.5))])
        let brute = StorySlideRenderer.renderComposite(slide: slideBrute, bgImage: nil, loadedImages: ["fond": image],
                                                       scale: 1)
        let reglee = StorySlideRenderer.renderComposite(slide: slideReglee, bgImage: nil, loadedImages: ["fond": image],
                                                        scale: 1)
        XCTAssertGreaterThan(try luminance(reglee?.cgImage), try luminance(brute?.cgImage) + 20,
                             "La couverture montre le fond tel que le lecteur le peint.")
    }

    // MARK: - La couche de fond : composer et lecteur

    private let geometrie = CanvasGeometry(renderSize: CGSize(width: 90, height: 160))
    private let url = "file:///tmp/FONDREGLE.jpg"

    @MainActor
    private func configurer(_ layer: StoryBackgroundLayer, _ image: UIImage, _ reglages: ImageAdjustments?,
                            filter: StoryFilter? = nil) {
        layer.configure(kind: .image(postMediaId: url, thumbHash: nil), transform: .identity, geometry: geometrie,
                        resolver: nil, imageCache: ComposerImageCacheReader(images: ["FONDREGLE": image], version: 1),
                        filter: filter, filterIntensity: 1, adjustments: reglages, contentVersion: 1)
    }

    @MainActor
    private func peint(_ layer: StoryBackgroundLayer) throws -> CGImage {
        let contents = try XCTUnwrap(layer.contentLayer?.contents)
        return contents as! CGImage
    }

    @MainActor
    func test_laCoucheDeFond_cuitLesReglagesDansLeBitmapPeint() throws {
        let image = gris()
        let layer = StoryBackgroundLayer()
        configurer(layer, image, ImageAdjustments(exposure: 1.5))
        XCTAssertGreaterThan(try luminance(try peint(layer)), try luminance(image.cgImage) + 20)
    }

    @MainActor
    func test_laCoucheDeFond_sansReglage_peintLeBitmapTelQuel() throws {
        let image = gris()
        let layer = StoryBackgroundLayer()
        configurer(layer, image, nil)
        XCTAssertTrue(try peint(layer) === image.cgImage!)
    }

    /// Un curseur qui glisse repeint le fond EN PLACE : même couche de contenu,
    /// aucun retour par le ThumbHash ni par le chargement.
    @MainActor
    func test_changerUnReglage_repeintLeFondEnPlace() throws {
        let image = gris()
        let layer = StoryBackgroundLayer()
        configurer(layer, image, nil)
        let couche = try XCTUnwrap(layer.contentLayer)

        configurer(layer, image, ImageAdjustments(exposure: 1.5))
        XCTAssertTrue(layer.contentLayer === couche, "Le fond n'est pas reconstruit pour un réglage.")
        XCTAssertGreaterThan(try luminance(try peint(layer)), try luminance(image.cgImage) + 20)

        configurer(layer, image, nil)
        XCTAssertTrue(try peint(layer) === image.cgImage!, "Revenir au neutre rend le bitmap d'origine.")
    }

    @MainActor
    func test_lesMemesReglages_neRepeignentRien() throws {
        let image = gris()
        let layer = StoryBackgroundLayer()
        configurer(layer, image, ImageAdjustments(contrast: 1.3))
        let avant = try peint(layer)
        configurer(layer, image, ImageAdjustments(contrast: 1.3))
        XCTAssertTrue(try peint(layer) === avant)
    }

    // MARK: - Le fond VIDÉO : la composition de son item

    @MainActor
    func test_unFondVideo_poseLaCompositionSurSonItem_sansRelancerSonPlayer() async throws {
        let clip = try await StoryVideoAdjustmentsRenderTests.writeGrayClip()
        let layer = StoryBackgroundLayer()
        let kind = StoryBackgroundLayer.Kind.video(postMediaId: clip.absoluteString, looping: false, mute: true,
                                                   thumbHash: nil)
        layer.configure(kind: kind, transform: .identity, geometry: geometrie, resolver: nil, imageCache: nil)
        let player = try XCTUnwrap(layer.avPlayer)
        try await Task.sleep(nanoseconds: 300_000_000)
        XCTAssertNil(player.currentItem?.videoComposition, "Sans réglage : le compositeur natif, zéro coût.")

        layer.configure(kind: kind, transform: .identity, geometry: geometrie, resolver: nil, imageCache: nil,
                        adjustments: ImageAdjustments(saturation: 0.2))
        XCTAssertTrue(layer.avPlayer === player, "Un réglage ne relance pas la vidéo de fond.")
        try await StoryVideoAdjustmentsRenderTests.attendre { player.currentItem?.videoComposition != nil }

        layer.configure(kind: kind, transform: .identity, geometry: geometrie, resolver: nil, imageCache: nil)
        try await StoryVideoAdjustmentsRenderTests.attendre { player.currentItem?.videoComposition == nil }
    }

    @MainActor
    func test_unFondVideoBoucle_regleChaqueItemDeLaBoucle() async throws {
        let clip = try await StoryVideoAdjustmentsRenderTests.writeGrayClip()
        let layer = StoryBackgroundLayer()
        layer.configure(kind: .video(postMediaId: clip.absoluteString, looping: true, mute: true, thumbHash: nil),
                        transform: .identity, geometry: geometrie, resolver: nil, imageCache: nil,
                        adjustments: ImageAdjustments(exposure: 0.6))
        let looper = try XCTUnwrap(layer.avPlayerLooper)
        try await StoryVideoAdjustmentsRenderTests.attendre {
            !looper.loopingPlayerItems.isEmpty && looper.loopingPlayerItems.allSatisfy { $0.videoComposition != nil }
        }
    }
}
