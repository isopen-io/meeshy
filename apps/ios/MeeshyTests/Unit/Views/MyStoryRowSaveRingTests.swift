import XCTest
@testable import Meeshy

// MARK: - MyStoryRowSaveRingTests
//
// La ligne est `.accessibilityElement(children: .ignore)` : un bouton enfant
// (l'anneau) serait avalé par le rotor. La progression doit donc remonter dans
// le libellé de la LIGNE, pas dans celui de l'anneau.
//
// Assertions volontairement indépendantes de la locale : la CI tourne en `en`,
// comparer à un littéral français rendrait ces tests verts en local et rouges
// en CI.
//
// `@MainActor` : `MyStoryRowAccessibility` vit dans le target `Meeshy`, dont
// `SWIFT_DEFAULT_ACTOR_ISOLATION` est `MainActor` (SE-0466) — un type non
// annoté y est donc main-actor-isolé par défaut. Même patron que
// `StorySaveProgressMapperTests` (Task 2) pour la même raison.
@MainActor
final class MyStoryRowSaveRingTests: XCTestCase {

    func test_label_noSaveInFlight_returnsBaseUnchanged() {
        XCTAssertEqual(MyStoryRowAccessibility.label(base: "BASE", saveProgress: nil), "BASE")
    }

    func test_label_saveInFlight_keepsBaseAsPrefix() {
        let label = MyStoryRowAccessibility.label(base: "BASE", saveProgress: 0.43)
        XCTAssertTrue(label.hasPrefix("BASE"), "libellé obtenu : \(label)")
        XCTAssertGreaterThan(label.count, "BASE".count, "un suffixe de progression doit être ajouté")
    }

    func test_label_saveInFlight_carriesPercentValue() {
        let label = MyStoryRowAccessibility.label(base: "BASE", saveProgress: 0.43)
        XCTAssertTrue(label.contains("43"), "libellé obtenu : \(label)")
    }

    func test_label_roundsPercentToNearest() {
        let label = MyStoryRowAccessibility.label(base: "BASE", saveProgress: 0.435)
        XCTAssertTrue(label.contains("44"), "libellé obtenu : \(label)")
    }

    func test_label_zeroProgress_carriesZero() {
        let label = MyStoryRowAccessibility.label(base: "BASE", saveProgress: 0)
        XCTAssertTrue(label.contains("0"), "libellé obtenu : \(label)")
    }

    func test_label_fullProgress_carriesHundred() {
        let label = MyStoryRowAccessibility.label(base: "BASE", saveProgress: 1)
        XCTAssertTrue(label.contains("100"), "libellé obtenu : \(label)")
    }
}
