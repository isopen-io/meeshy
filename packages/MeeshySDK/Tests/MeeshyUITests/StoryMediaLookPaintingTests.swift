import XCTest
import UIKit
import CoreImage
@testable import MeeshyUI
@testable import MeeshySDK

/// #13840 — **le look d'un média se PEINT en direct, par le peintre que l'app
/// injecte** : le canvas, la vignette, l'export d'une trame vidéo et le fond le
/// demandent au même peintre, et un média sans look (ou une app sans peintre)
/// passe tel quel. L'objet garde son identité et son fichier : l'annulation
/// couvre le look comme tout réglage.
final class StoryMediaLookPaintingTests: XCTestCase {

    private nonisolated struct Rougeur: StoryMediaLookPainting {
        func paint(_ image: CIImage, look: StoryMediaLook, still: Bool) -> CIImage {
            CIImage(color: CIColor(red: 1, green: 0, blue: 0)).cropped(to: image.extent)
        }
    }

    override func setUp() {
        super.setUp()
        StoryMediaLookPainterRegistry.painter = Rougeur()
    }

    override func tearDown() {
        StoryMediaLookPainterRegistry.painter = nil
        super.tearDown()
    }

    private func gris(side: CGFloat = 8) -> UIImage {
        let format = UIGraphicsImageRendererFormat.default()
        format.scale = 1
        return UIGraphicsImageRenderer(size: CGSize(width: side, height: side), format: format).image { ctx in
            UIColor(white: 0.5, alpha: 1).setFill()
            ctx.fill(CGRect(x: 0, y: 0, width: side, height: side))
        }
    }

    private func centre(_ cg: CGImage?) throws -> (r: Int, g: Int, b: Int) {
        let cg = try XCTUnwrap(cg)
        var pixel = [UInt8](repeating: 0, count: 4)
        let contexte = try XCTUnwrap(CGContext(data: &pixel, width: 1, height: 1, bitsPerComponent: 8,
                                               bytesPerRow: 4, space: CGColorSpaceCreateDeviceRGB(),
                                               bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue))
        contexte.draw(cg, in: CGRect(x: -CGFloat(cg.width) / 2, y: -CGFloat(cg.height) / 2,
                                     width: CGFloat(cg.width), height: CGFloat(cg.height)))
        return (Int(pixel[0]), Int(pixel[1]), Int(pixel[2]))
    }

    private func media(_ kind: StoryMediaKind, look: StoryMediaLook?) -> StoryMediaObject {
        var objet = StoryMediaObject(id: "m-\(UUID().uuidString)", kind: kind, aspectRatio: 1)
        objet.look = look
        return objet
    }

    // MARK: - Le rendu d'une image posée

    @MainActor
    func test_filtered_imageAvecLook_estPeinteParLePeintreInjecte() throws {
        let peinte = StoryMediaLayer.filtered(gris(), for: media(.image, look: StoryMediaLook(frameId: "frame:x")))
        let pixel = try centre(peinte?.cgImage)
        XCTAssertGreaterThan(pixel.r, 200)
        XCTAssertLessThan(pixel.g, 40, "le look du peintre est ce que la couche montre")
    }

    @MainActor
    func test_filtered_imageSansLook_passeTelleQuelle() {
        let image = gris()
        XCTAssertTrue(StoryMediaLayer.filtered(image, for: media(.image, look: nil)) === image)
    }

    @MainActor
    func test_filtered_sansPeintre_unLookSeLitNeutre() {
        StoryMediaLookPainterRegistry.painter = nil
        let image = gris()
        XCTAssertTrue(StoryMediaLayer.filtered(image, for: media(.image, look: StoryMediaLook(filterPreset: "warm"))) === image)
    }

    @MainActor
    func test_filtered_changerDeLook_repeintLImage() throws {
        let image = gris()
        let objet = media(.image, look: nil)
        _ = StoryMediaLayer.filtered(image, for: objet)
        var regle = objet
        regle.look = StoryMediaLook(filterPreset: "cool")
        let pixel = try centre(StoryMediaLayer.filtered(image, for: regle)?.cgImage)
        XCTAssertGreaterThan(pixel.r, 200, "le cache de cuisson suit le look, il ne resert pas l'ancien rendu")
    }

    // MARK: - Le fond, la trame vidéo, l'affiche

    func test_backgroundImage_fondAvecLook_estPeint() throws {
        var fond = media(.image, look: StoryMediaLook(faceEffect: "angel"))
        fond.isBackground = true
        var effets = StoryEffects()
        effets.mediaObjects = [fond]
        let pixel = try centre(StoryBackgroundLook.image(gris(), effects: effets).cgImage)
        XCTAssertGreaterThan(pixel.r, 200)
    }

    func test_videoFrame_videoPoseeAvecLook_estPeinte() throws {
        let trame = try XCTUnwrap(gris().cgImage)
        let pixel = try centre(StoryVideoAdjustmentsProcessor.apply(media(.video, look: StoryMediaLook(filterPreset: "warm")),
                                                                    to: trame))
        XCTAssertGreaterThan(pixel.r, 200, "l'export d'une vidéo peint son look trame par trame")
    }

    func test_videoFrame_videoSansLook_trameTelleQuelle() throws {
        let trame = try XCTUnwrap(gris().cgImage)
        XCTAssertTrue(StoryVideoAdjustmentsProcessor.apply(media(.video, look: nil), to: trame) === trame)
    }

    func test_paintsVideo_lookOuReglages_demandentUneComposition() {
        XCTAssertTrue(StoryVideoAdjustmentsProcessor.paints(media(.video, look: StoryMediaLook(filterPreset: "warm"))))
        XCTAssertFalse(StoryVideoAdjustmentsProcessor.paints(media(.video, look: nil)))
    }

    // MARK: - Le modèle, par le ViewModel

    @MainActor
    func test_applyMediaObjectLook_garderLIdentite_etLAnnulationLeRetire() throws {
        let vm = StoryComposerViewModel()
        let objet = try XCTUnwrap(vm.addMediaObject(kind: .image))
        vm.seedHistory()
        let look = StoryMediaLook(filterPreset: "warm", frameId: "frame:joy.confetti.1")

        apply(vm, objet.id, look)
        vm.pushHistorySnapshot()

        XCTAssertEqual(vm.currentEffects.mediaLook(id: objet.id), look)
        XCTAssertEqual(vm.currentEffects.mediaObjects?.map(\.id), [objet.id], "aucun objet neuf, aucun fichier neuf")
        XCTAssertTrue(vm.undoGlobal())
        XCTAssertEqual(vm.currentEffects.mediaLook(id: objet.id), StoryMediaLook(), "l'annulation couvre le look")
        XCTAssertTrue(vm.redoGlobal())
        XCTAssertEqual(vm.currentEffects.mediaLook(id: objet.id), look)
    }

    @MainActor
    func test_applyMediaObjectLook_neutre_effaceLeChamp() throws {
        let vm = StoryComposerViewModel()
        let objet = try XCTUnwrap(vm.addMediaObject(kind: .image))
        apply(vm, objet.id, StoryMediaLook(faceEffect: "toad"))
        apply(vm, objet.id, StoryMediaLook())
        XCTAssertNil(vm.currentEffects.mediaObjects?.first { $0.id == objet.id }?.look)
    }

    @MainActor
    func test_applyMediaObjectLook_idInconnu_neFaitRien() {
        let vm = StoryComposerViewModel()
        apply(vm, "absent", StoryMediaLook(filterPreset: "warm"))
        XCTAssertEqual(vm.currentEffects.mediaLook(id: "absent"), StoryMediaLook())
    }

    @MainActor private func apply(_ vm: StoryComposerViewModel, _ id: String, _ look: StoryMediaLook) {
        StoryMediaLookEditing.apply(look, toMedia: id, in: vm)
    }
}
