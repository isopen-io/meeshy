import XCTest
@testable import Meeshy
@testable import MeeshyUI

// MARK: - StoryVisibilityMenuResolverTests
//
// Le sous-menu marque le mode courant d'un `checkmark` à la place de son icône.
// Choix conservateur assumé face aux cases à cocher natives d'un Picker inline :
// sous iOS 26, un `.tint(.clear)` fait disparaître TOUTES les icônes d'un menu.
//
// `@MainActor` : `StoryVisibilityMenuResolver` vit dans le target `Meeshy`, dont
// `SWIFT_DEFAULT_ACTOR_ISOLATION` est `MainActor` (SE-0466) — un type non annoté
// y est donc main-actor-isolé par défaut, y compris la conformance `Equatable`
// de son `Route` imbriqué. Même patron que `MyStoryRowSaveRingTests` (Task 2/3)
// pour la même raison.
@MainActor
final class StoryVisibilityMenuResolverTests: XCTestCase {

    func test_isCurrent_matchingRawValue_isTrue() {
        XCTAssertTrue(StoryVisibilityMenuResolver.isCurrent(.public, rawValue: "PUBLIC"))
    }

    /// Le serveur peut renvoyer une casse inattendue — la comparaison est
    /// insensible à la casse, comme `StoryItem.isPublic`.
    func test_isCurrent_lowercasedRawValue_isTrue() {
        XCTAssertTrue(StoryVisibilityMenuResolver.isCurrent(.friends, rawValue: "friends"))
    }

    func test_isCurrent_differentRawValue_isFalse() {
        XCTAssertFalse(StoryVisibilityMenuResolver.isCurrent(.private, rawValue: "PUBLIC"))
    }

    func test_isCurrent_nilRawValue_isFalse() {
        XCTAssertFalse(StoryVisibilityMenuResolver.isCurrent(.public, rawValue: nil))
    }

    func test_isCurrent_unknownRawValue_matchesNothing() {
        for candidate in PostVisibility.composerSelectableCases {
            XCTAssertFalse(StoryVisibilityMenuResolver.isCurrent(candidate, rawValue: "WEIRD"),
                           "\(candidate) ne doit pas matcher une valeur inconnue")
        }
    }

    func test_symbol_currentMode_isCheckmark() {
        XCTAssertEqual(StoryVisibilityMenuResolver.symbol(for: .only, currentRawValue: "ONLY"), "checkmark")
    }

    func test_symbol_otherMode_isItsOwnIcon() {
        XCTAssertEqual(StoryVisibilityMenuResolver.symbol(for: .friends, currentRawValue: "ONLY"),
                       PostVisibility.friends.icon)
    }

    /// Contrat du menu : exactement les 6 modes demandés, dans cet ordre.
    func test_composerSelectableCases_isTheSixRequestedModes() {
        XCTAssertEqual(PostVisibility.composerSelectableCases,
                       [.public, .community, .friends, .except, .only, .private])
    }

    /// Un seul checkmark à la fois — sinon le menu affirmerait deux modes actifs.
    func test_exactlyOneCheckmarkForAKnownMode() {
        let checkmarks = PostVisibility.composerSelectableCases
            .filter { StoryVisibilityMenuResolver.symbol(for: $0, currentRawValue: "EXCEPT") == "checkmark" }
        XCTAssertEqual(checkmarks, [.except])
    }

    // MARK: Routage du tap

    /// Re-choisir le mode déjà actif ne doit RIEN faire : pas d'aller-retour
    /// réseau, pas de picker qui s'ouvre pour rien.
    func test_route_sameMode_isIgnored() {
        XCTAssertEqual(StoryVisibilityMenuResolver.route(to: .public, current: "PUBLIC"), .ignored)
    }

    func test_route_simpleMode_appliesDirectly() {
        XCTAssertEqual(StoryVisibilityMenuResolver.route(to: .private, current: "PUBLIC"), .applyDirectly)
    }

    /// EXCEPT / ONLY ne partent JAMAIS au serveur sans sélection : le gateway
    /// les rejette (refine Zod « require at least one userId »).
    func test_route_audienceModes_openPicker() {
        XCTAssertEqual(StoryVisibilityMenuResolver.route(to: .except, current: "PUBLIC"), .openAudiencePicker)
        XCTAssertEqual(StoryVisibilityMenuResolver.route(to: .only, current: "PUBLIC"), .openAudiencePicker)
    }

    /// Une visibilité serveur inconnue ne doit bloquer aucun choix.
    func test_route_unknownCurrent_stillAllowsEveryMode() {
        for mode in PostVisibility.composerSelectableCases {
            XCTAssertNotEqual(StoryVisibilityMenuResolver.route(to: mode, current: "WEIRD"), .ignored)
        }
    }
}
