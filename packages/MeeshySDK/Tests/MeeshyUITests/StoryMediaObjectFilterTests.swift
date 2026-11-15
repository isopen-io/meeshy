import XCTest
import UIKit
@testable import MeeshyUI
@testable import MeeshySDK

/// **Les réglages d'un objet ne touchent que lui** (retour porteur 2026-09-28).
/// Le filtre choisi dans l'éditeur d'une image POSÉE teintait le fond, porteur
/// du filtre de slide : l'objet a désormais le sien.
final class StoryMediaObjectFilterTests: XCTestCase {

    func test_leFiltreDeLObjet_survitALEncodage() throws {
        var media = StoryMediaObject(id: "m", kind: .image, aspectRatio: 1)
        media.filter = StoryFilter.vintage.rawValue
        let relu = try JSONDecoder().decode(StoryMediaObject.self, from: JSONEncoder().encode(media))
        XCTAssertEqual(relu.filter, "vintage")
        XCTAssertEqual(relu.parsedFilter, .vintage)
    }

    func test_sansFiltre_aucuneCleNEstEcrite() throws {
        let data = try JSONEncoder().encode(StoryMediaObject(id: "m", kind: .image, aspectRatio: 1))
        let json = try XCTUnwrap(JSONSerialization.jsonObject(with: data) as? [String: Any])
        XCTAssertNil(json["filter"], "Un objet sans filtre n'alourdit pas les effets publiés.")
    }

    func test_unFiltreInconnu_seLitSansFiltre() {
        var media = StoryMediaObject(id: "m", kind: .image, aspectRatio: 1)
        media.filter = "futur-filtre"
        XCTAssertNil(media.parsedFilter)
    }

    @MainActor
    func test_poserLeFiltreDUnObjet_neTouchePasLeFiltreDeLaSlide() throws {
        let vm = StoryComposerViewModel()
        let objet = try XCTUnwrap(vm.addMediaObject(kind: .image))
        vm.applyFilter(StoryFilter.bw.rawValue)

        vm.applyMediaObjectFilter(id: objet.id, StoryFilter.warm.rawValue)

        XCTAssertEqual(vm.mediaObjectFilter(id: objet.id), "warm")
        XCTAssertEqual(vm.currentEffects.filter, "bw", "Le fond garde son filtre.")
    }

    @MainActor
    func test_unIdInconnu_neFaitRien() {
        let vm = StoryComposerViewModel()
        vm.applyMediaObjectFilter(id: "absent", StoryFilter.warm.rawValue)
        XCTAssertNil(vm.mediaObjectFilter(id: "absent"))
    }

    @MainActor
    func test_leCalque_cuitLeFiltreDansLImageDeLObjet() {
        let image = UIGraphicsImageRenderer(size: CGSize(width: 8, height: 8)).image { ctx in
            UIColor.red.setFill(); ctx.fill(CGRect(x: 0, y: 0, width: 8, height: 8))
        }
        var media = StoryMediaObject(id: "m", kind: .image, aspectRatio: 1)
        XCTAssertTrue(StoryMediaLayer.filtered(image, for: media) === image, "Sans filtre, l'image passe telle quelle.")
        media.filter = StoryFilter.bw.rawValue
        XCTAssertFalse(StoryMediaLayer.filtered(image, for: media) === image, "Avec un filtre, l'image est retraitée.")
    }
}
