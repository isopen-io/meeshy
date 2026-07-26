import XCTest
@testable import Meeshy

// MARK: - StorySaveProgressRingTests
//
// L'anneau est partagé par la ligne « Mes stories » et le rail d'actions du
// reader (Task 7) : une seule fonction de clamp/pourcentage, sinon les deux
// surfaces divergeraient dès la première retouche (épaisseur, arrondi, sens
// de rotation — cf. la doc de `StorySaveProgressRing`). `clamp(_:)` et
// `percent(_:)` sont statiques et pures précisément pour rester testables
// sans instancier de vue SwiftUI ni monter un hôte de rendu.
//
// `@MainActor` : `StorySaveProgressRing` vit dans le target `Meeshy`, dont
// `SWIFT_DEFAULT_ACTOR_ISOLATION` est `MainActor` (SE-0466) — un type non
// annoté y est donc main-actor-isolé par défaut. Même patron que
// `StorySaveProgressMapperTests` (Task 2) et `MyStoryRowSaveRingTests` (Task 6)
// pour la même raison.
@MainActor
final class StorySaveProgressRingTests: XCTestCase {

    // MARK: clamp(_:)

    func test_clamp_negative_clampsToZero() {
        XCTAssertEqual(StorySaveProgressRing.clamp(-0.5), 0, accuracy: 0.0001)
    }

    func test_clamp_aboveOne_clampsToOne() {
        XCTAssertEqual(StorySaveProgressRing.clamp(1.5), 1, accuracy: 0.0001)
    }

    func test_clamp_zero_staysZero() {
        XCTAssertEqual(StorySaveProgressRing.clamp(0), 0, accuracy: 0.0001)
    }

    func test_clamp_one_staysOne() {
        XCTAssertEqual(StorySaveProgressRing.clamp(1), 1, accuracy: 0.0001)
    }

    // MARK: percent(_:)

    func test_percent_roundsToNearest() {
        XCTAssertEqual(StorySaveProgressRing.percent(0.435), 44)
    }

    func test_percent_clampsNegativeBeforeRounding() {
        XCTAssertEqual(StorySaveProgressRing.percent(-0.2), 0)
    }

    func test_percent_clampsAboveOneBeforeRounding() {
        XCTAssertEqual(StorySaveProgressRing.percent(1.2), 100)
    }
}
