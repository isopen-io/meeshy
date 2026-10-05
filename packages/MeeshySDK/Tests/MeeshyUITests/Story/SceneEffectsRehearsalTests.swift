import XCTest
import UIKit
@testable import MeeshyUI
@testable import MeeshySDK

/// **Les effets de scène : ouverture, fermeture, miniatures et répétition**
/// (#8792 — directive porteur 2026-09-30 : « lors du choix la scène doit être
/// mise à jour en direct en recommençant l'ouverture sélectionnée ainsi que la
/// fermeture ! »).
@MainActor
final class SceneEffectsRehearsalTests: XCTestCase {

    // MARK: - Les transitions de la slide sont écrites SUR la slide

    func test_setSlideTransitions_ecritOuvertureEtFermetureSurLaSlideCourante() {
        let vm = StoryComposerViewModel()
        vm.setSlideTransitions(opening: .zoom, closing: .fade)
        XCTAssertEqual(vm.currentEffects.opening, .zoom)
        XCTAssertEqual(vm.currentEffects.closing, .fade)
        XCTAssertEqual(vm.openingEffect, .zoom, "l'atelier relit la même valeur à sa synchro")
        XCTAssertEqual(vm.closingEffect, .fade)
    }

    func test_setSlideTransitions_neTouchePasLesAutresSlides() {
        let vm = StoryComposerViewModel()
        vm.addSlide()
        vm.selectSlide(at: 1)
        vm.setSlideTransitions(opening: .reveal, closing: nil)
        XCTAssertNil(vm.slides[0].effects.opening)
        XCTAssertEqual(vm.slides[1].effects.opening, .reveal)
        XCTAssertNil(vm.slides[1].effects.closing)
    }

    // MARK: - La répétition : ouverture, pause, fermeture

    func test_rehearsal_sansEffet_estVide() {
        XCTAssertTrue(StoryTransitionRehearsal(opening: nil, closing: nil).isEmpty)
        XCTAssertFalse(StoryTransitionRehearsal(opening: .fade, closing: nil).isEmpty)
    }

    func test_phase_ouvertureEnTete_puisPause_puisFermeture_puisFin() {
        let plan = StoryTransitionRehearsal(opening: .fade, closing: .zoom)
        let d = StoryRenderer.slideTransitionDuration
        XCTAssertEqual(plan.phase(at: 0.1), .opening)
        XCTAssertEqual(plan.phase(at: d + 0.1), .hold)
        guard case .closing(let p) = plan.phase(at: plan.closingStart + d / 2) else {
            return XCTFail("à mi-fermeture, la phase est la fermeture")
        }
        XCTAssertEqual(p, 0.5, accuracy: 0.001)
        XCTAssertEqual(plan.phase(at: plan.totalDuration + 0.01), .finished)
    }

    func test_phase_sansOuverture_laFermetureArriveApresLaPause() {
        let plan = StoryTransitionRehearsal(opening: nil, closing: .slide)
        XCTAssertEqual(plan.phase(at: 0.05), .hold, "rien à ouvrir : la scène se montre avant de sortir")
        guard case .closing = plan.phase(at: plan.closingStart + 0.01) else {
            return XCTFail("la fermeture se joue")
        }
    }

    func test_phase_sansFermeture_seTermineApresLOuverture() {
        let plan = StoryTransitionRehearsal(opening: .reveal, closing: nil)
        XCTAssertEqual(plan.phase(at: plan.closingStart + 0.01), .finished,
                       "aucune fermeture choisie : la répétition s'arrête sur la scène entière")
    }

    // MARK: - Les miniatures des effets visuels

    private func image(_ size: CGSize, color: UIColor = .systemTeal) -> UIImage {
        UIGraphicsImageRenderer(size: size).image { ctx in
            color.setFill()
            ctx.fill(CGRect(origin: .zero, size: size))
        }
    }

    func test_tiles_uneMiniatureParFiltrePlusLOriginal() async {
        let tiles = await StoryFilterThumbnails.tiles(for: image(CGSize(width: 300, height: 600)),
                                                      sourceKey: "fond-a-\(UUID().uuidString)")
        XCTAssertEqual(Set(tiles.keys), Set([StoryFilterThumbnails.originalKey]
                                            + StoryFilter.allCases.map(\.rawValue)))
    }

    func test_tiles_carreesSansDeformer() async throws {
        let tiles = await StoryFilterThumbnails.tiles(for: image(CGSize(width: 300, height: 900)),
                                                      sourceKey: "fond-b-\(UUID().uuidString)")
        let original = try XCTUnwrap(tiles[StoryFilterThumbnails.originalKey])
        XCTAssertEqual(original.size.width, original.size.height, "une vignette est un carré rogné, jamais écrasé")
        XCTAssertEqual(original.size.width, StoryFilterThumbnails.side)
    }

    func test_tiles_memeSource_serviesDuCache() async {
        let cle = "fond-c-\(UUID().uuidString)"
        let source = image(CGSize(width: 200, height: 200))
        let premier = await StoryFilterThumbnails.tiles(for: source, sourceKey: cle)
        let second = await StoryFilterThumbnails.tiles(for: source, sourceKey: cle)
        XCTAssertTrue(premier["bw"] === second["bw"], "une source déjà rendue ne se recalcule pas")
    }

    func test_sourceKey_changeAvecLImage() {
        let a = image(CGSize(width: 10, height: 10))
        let b = image(CGSize(width: 10, height: 10))
        XCTAssertNotEqual(StoryFilterThumbnails.sourceKey(slideId: "s1", image: a),
                          StoryFilterThumbnails.sourceKey(slideId: "s1", image: b),
                          "changer le fond d'une MÊME slide ne ressert pas les vignettes de l'ancien")
    }
}
