import XCTest
import UIKit
@testable import MeeshyUI
@testable import MeeshySDK

/// **B1 (#3924) — changer de mode ne jette jamais le contenu.**
/// Le composer garde UN seul contenu ; la scène qui naît le reçoit sur sa
/// slide courante via les points d'entrée publics `applyContentText` (le texte)
/// et `applyContentMedia` (le média), d'où ils partiront à la publication (et où
/// B2 rendra le texte dans une section repliable).
@MainActor
final class StoryComposerContentPreservationTests: XCTestCase {

    func test_applyContentText_semeLeContenuSurLaSlideCourante() {
        let vm = StoryComposerViewModel()
        vm.applyContentText("Bonjour le monde")
        XCTAssertEqual(vm.currentSlide.content, "Bonjour le monde",
                       "Le contenu écrit au composer SUIT sur la slide de la scène.")
    }

    func test_applyContentText_videMetNil_pasDeContenuFantome() {
        let vm = StoryComposerViewModel()
        vm.applyContentText("x")
        vm.applyContentText("")
        XCTAssertNil(vm.currentSlide.content,
                     "Un contenu vidé devient nil — jamais une chaîne vide fantôme.")
    }

    // MARK: - Le média SUIT dans la scène (B1)

    /// Écrit un JPEG minuscule sur disque et rend son URL — un média LOCAL comme
    /// celui qu'une pièce jointe du document présente.
    private func makeTempImage() throws -> URL {
        let renderer = UIGraphicsImageRenderer(size: CGSize(width: 4, height: 4))
        let image = renderer.image { ctx in
            UIColor.systemTeal.setFill()
            ctx.fill(CGRect(x: 0, y: 0, width: 4, height: 4))
        }
        let data = try XCTUnwrap(image.jpegData(compressionQuality: 0.9))
        let url = FileManager.default.temporaryDirectory
            .appendingPathComponent("b1-\(UUID().uuidString).jpg")
        try data.write(to: url)
        return url
    }

    func test_applyContentMedia_poseLeMediaSurLaSlide_etLePremierEstLeFond() throws {
        let vm = StoryComposerViewModel()
        let url = try makeTempImage()
        vm.applyContentMedia([ComposerContentMedia(sourceURL: url, kind: .image)])

        let medias = vm.currentSlide.effects.mediaObjects ?? []
        XCTAssertEqual(medias.count, 1,
                       "Le média composé au document SUIT sur la slide de la scène.")
        XCTAssertEqual(medias.first?.isBackground, true,
                       "Le PREMIER média posé sur une slide vierge devient son fond.")
    }

    func test_applyContentMedia_estIdempotent_pasDeDoublonAuRetour() throws {
        let vm = StoryComposerViewModel()
        let url = try makeTempImage()
        let media = ComposerContentMedia(sourceURL: url, kind: .image)
        // Deux bascules successives (Post→Story→Post→Story) refirent la closure.
        vm.applyContentMedia([media])
        vm.applyContentMedia([media])
        XCTAssertEqual(vm.currentSlide.effects.mediaObjects?.count, 1,
                       "Un aller-retour de mode ne porte pas le même média deux fois.")
    }
}
