import XCTest
import UIKit
@testable import MeeshyUI
@testable import MeeshySDK

/// Task 20 — point d'entrée produit de la pastille de lieu : le composer doit
/// pouvoir en POSER une. Sans lui, tout le reste (modèle, dessin, export) est du
/// code mort et la recette « poser une pastille, exporter, la voir dans la
/// vidéo » est inexécutable.
@MainActor
final class StoryComposerLocationTests: XCTestCase {

    private let place = SharedPlace(latitude: 48.8566, longitude: 2.3522,
                                   name: "Tour Eiffel", address: "Champ de Mars, Paris")

    func test_addLocation_posesTheBadgeAtBottomCenterOfTheCurrentSlide() {
        let vm = StoryComposerViewModel()

        let added = vm.addLocation(place: place)

        XCTAssertEqual(vm.currentEffects.locationObjects.count, 1)
        XCTAssertEqual(vm.currentEffects.locationObjects.first?.id, added.id)
        XCTAssertEqual(added.place.name, "Tour Eiffel")
        XCTAssertEqual(added.x, 0.5, accuracy: 0.0001)
        XCTAssertEqual(added.y, 0.8, accuracy: 0.0001,
                       "La pastille se pose en bas de slide, centrée (brief T20).")
    }

    /// Elle vit dans les EFFETS — la seule unité persistée (brouillon) et
    /// envoyée au serveur.
    func test_addLocation_writesIntoTheSlideEffects() {
        let vm = StoryComposerViewModel()

        vm.addLocation(place: place)

        XCTAssertEqual(vm.currentSlide.effects.locationObjects.count, 1)
        XCTAssertEqual(vm.currentSlide.locationObjects.count, 1)
    }

    func test_addLocation_promotesTheBadgeAboveExistingElements() throws {
        let vm = StoryComposerViewModel()
        let textId = try XCTUnwrap(vm.addText()?.id)

        let badge = vm.addLocation(place: place)

        XCTAssertGreaterThan(vm.zIndex(for: badge.id), vm.zIndex(for: textId),
                             "Un élément fraîchement posé arrive au premier plan.")
    }

    func test_removeLocation_takesTheBadgeBackOff() {
        let vm = StoryComposerViewModel()
        let badge = vm.addLocation(place: place)

        vm.removeLocation(id: badge.id)

        XCTAssertTrue(vm.currentEffects.locationObjects.isEmpty)
    }

    // MARK: - Chrome du composer (point d'entrée)

    private func source(_ relativePath: String) throws -> String {
        let packageRoot = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()  // retire le nom de fichier
            .deletingLastPathComponent()  // Composer/
            .deletingLastPathComponent()  // Story/
            .deletingLastPathComponent()  // MeeshyUITests/
            .deletingLastPathComponent()  // Tests/ → packages/MeeshySDK
        return try String(contentsOf: packageRoot.appendingPathComponent(relativePath),
                          encoding: .utf8)
    }
}
