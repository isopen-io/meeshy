import XCTest
import UIKit
@testable import Meeshy
@testable import MeeshyUI

/// **Une graine média ne se perd jamais, quel que soit le canal** (#5409).
///
/// Directive porteur 2026-09-06 : le longpress d'un message doit ouvrir le
/// composer v3. Le routage seul ne suffisait pas — sur la voie DOCUMENT, seule
/// `documentLocalMedia` est téléversée, et la graine saute l'intake qui
/// l'alimente. Ce fichier garde le pont qui rend le reroutage sûr.
@MainActor
final class ComposerSeedIngestionTests: XCTestCase {

    private func url(_ nom: String) -> URL {
        FileManager.default.temporaryDirectory.appendingPathComponent(nom)
    }

    // MARK: - Ce qui doit PARTIR

    func test_plan_uneGraineImageRemetSonFichierSource_pasSonBitmap() {
        let fichier = url("photo-source.jpg")
        let graine = StoryComposerSeed(
            payload: .image(UIImage()),
            origin: .init(fileURL: fichier, mimeType: "image/jpeg")
        )
        let plan = ComposerSeedIngestion.plan(for: graine)
        XCTAssertEqual(plan?.media.url, fichier)
        XCTAssertEqual(plan?.media.mimeType, "image/jpeg")
    }

    /// Le mime est celui DÉCLARÉ à la source, jamais re-dérivé de l'extension —
    /// la règle de `ComposerDocumentMediaFactory`, dont la graine ne s'exempte
    /// pas.
    func test_plan_porteLeMimeDeclare() {
        let graine = StoryComposerSeed(
            payload: .video(fileURL: url("clip.bin"), objectId: "obj-7"),
            origin: .init(fileURL: url("clip.bin"), mimeType: "video/mp4", objectId: "obj-7")
        )
        XCTAssertEqual(ComposerSeedIngestion.plan(for: graine)?.media.mimeType, "video/mp4")
    }

    // MARK: - Ce qui FONDE une scène, donc gagne une tuile

    func test_plan_imageEtVideoFondentLaScene() {
        let image = StoryComposerSeed(payload: .image(UIImage()),
                                      origin: .init(fileURL: url("a.jpg"), mimeType: "image/jpeg"))
        let video = StoryComposerSeed(payload: .video(fileURL: url("b.mov"), objectId: "o"),
                                      origin: .init(fileURL: url("b.mov"), mimeType: "video/quicktime"))
        XCTAssertEqual(ComposerSeedIngestion.plan(for: image)?.foundsScene, true)
        XCTAssertEqual(ComposerSeedIngestion.plan(for: video)?.foundsScene, true)
    }

    /// Un son n'est pas une page : il n'a pas de tuile dans la rangée haute —
    /// même règle que pour un son ingéré par le rail (`ComposerHeaderTiles`).
    func test_plan_unSonNeFondePasDeScene() {
        let son = StoryComposerSeed(payload: .audio(fileURL: url("voix.m4a")),
                                    origin: .init(fileURL: url("voix.m4a"), mimeType: "audio/m4a"))
        XCTAssertEqual(ComposerSeedIngestion.plan(for: son)?.foundsScene, false)
    }

    // MARK: - Le pont vers l'objet de canvas

    func test_plan_laVideoNommeSonObjet_lImageLeLaisseALHote() {
        let video = StoryComposerSeed(payload: .video(fileURL: url("c.mov"), objectId: "obj-42"),
                                      origin: .init(fileURL: url("c.mov"),
                                                    mimeType: "video/quicktime",
                                                    objectId: "obj-42"))
        XCTAssertEqual(ComposerSeedIngestion.plan(for: video)?.objectId, "obj-42")

        let image = StoryComposerSeed(payload: .image(UIImage()),
                                      origin: .init(fileURL: url("d.jpg"), mimeType: "image/jpeg"))
        XCTAssertNil(ComposerSeedIngestion.plan(for: image)?.objectId,
                     "l'identité d'un fond image naît dans init(seeding:) — l'inventer ici casserait le pont des légendes")
    }

    // MARK: - Ce qui n'a rien à téléverser

    func test_plan_uneGraineDeTexteNaRienARemettre() {
        XCTAssertNil(ComposerSeedIngestion.plan(for: StoryComposerSeed.text("Bonjour")))
    }

    func test_plan_aucuneGraine() {
        XCTAssertNil(ComposerSeedIngestion.plan(for: nil))
    }

    // MARK: - Les fabriques du SDK posent l'origine

    /// Le rang qui compte : la fabrique VIDÉO copie le fichier sous la
    /// convention du composer, et c'est CETTE copie — pas la source, soumise à
    /// éviction — que la publication doit emporter.
    func test_fabriqueVideo_poseUneOrigineSurLaCopie() throws {
        let source = url("source-\(UUID().uuidString).mov")
        try Data([0x00, 0x01]).write(to: source)
        defer { try? FileManager.default.removeItem(at: source) }

        let graine = try XCTUnwrap(StoryComposerSeed.video(copying: source,
                                                          declaredMimeType: "video/mp4"))
        let origine = try XCTUnwrap(graine.origin)
        XCTAssertNotEqual(origine.fileURL, source, "l'origine doit désigner la COPIE, jamais la source évincible")
        XCTAssertEqual(origine.mimeType, "video/mp4")
        guard case .video(let fileURL, let objectId) = try XCTUnwrap(graine.payload) else {
            return XCTFail("payload vidéo attendu")
        }
        XCTAssertEqual(origine.fileURL, fileURL, "le canvas et la publication désignent le MÊME fichier")
        XCTAssertEqual(origine.objectId, objectId, "le pont vers l'objet de canvas passe par l'origine")
        try? FileManager.default.removeItem(at: fileURL)
    }
}
