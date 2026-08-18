import XCTest
import UIKit
@testable import MeeshyUI
@testable import MeeshySDK

/// Directive user 2026-08-18 : « on doit pouvoir identifier des utilisateurs
/// dans les story sans que ce ne soit dans un texte (ajouter une action '@'
/// pour ce faire) ».
///
/// La pastille EST un `StoryTextObject` portant `@pseudo` — c'est ce qui lui
/// donne gratuitement le déplacement, la rotation, le z-order, la timeline, le
/// rendu à l'export et la persistance. Un type d'élément neuf aurait réclamé
/// ces six chemins, et en aurait silencieusement raté un.
@MainActor
final class StoryComposerMentionTests: XCTestCase {

    func test_addMention_posesAHandleBadgeOnTheCurrentSlide() throws {
        let vm = StoryComposerViewModel()

        let badge = try XCTUnwrap(vm.addMention(username: "alice"))

        XCTAssertEqual(badge.text, "@alice")
        XCTAssertEqual(vm.currentEffects.textObjects.count, 1)
        XCTAssertEqual(vm.currentEffects.textObjects.first?.id, badge.id)
    }

    /// Elle vit dans les EFFETS — la seule unité que le dépôt persiste et que le
    /// serveur reçoit.
    func test_addMention_writesIntoTheSlideEffects() {
        let vm = StoryComposerViewModel()

        vm.addMention(username: "alice")

        XCTAssertEqual(vm.currentSlide.effects.textObjects.count, 1)
    }

    /// Le fond plein est la SEULE chose qui la fait lire comme une étiquette et
    /// non comme du texte libre.
    func test_addMention_readsAsALabel_notAsFreeText() throws {
        let vm = StoryComposerViewModel()

        let badge = try XCTUnwrap(vm.addMention(username: "alice"))

        guard case .solid = badge.backgroundStyle else {
            return XCTFail("La pastille doit porter un fond plein.")
        }
    }

    func test_addMention_promotesTheBadgeAboveExistingElements() throws {
        let vm = StoryComposerViewModel()
        let textId = try XCTUnwrap(vm.addText()?.id)

        let badge = try XCTUnwrap(vm.addMention(username: "alice"))

        XCTAssertGreaterThan(vm.zIndex(for: badge.id), vm.zIndex(for: textId),
                             "Un élément fraîchement posé arrive au premier plan.")
    }

    /// Deux mentions d'affilée ne doivent pas se superposer exactement — même
    /// cascade que les lieux et les stickers.
    func test_addMention_cascadesSoTwoBadgesNeverOverlapExactly() throws {
        let vm = StoryComposerViewModel()

        let first = try XCTUnwrap(vm.addMention(username: "alice"))
        let second = try XCTUnwrap(vm.addMention(username: "bob"))

        XCTAssertNotEqual(first.y, second.y, accuracy: 0.0001)
    }

    /// Le geste s'achève à la pose. Basculer sur l'outil texte obligerait à
    /// refermer un panneau d'édition pour épingler une seconde personne.
    func test_addMention_doesNotOpenTheTextEditor() {
        let vm = StoryComposerViewModel()

        vm.addMention(username: "alice")

        XCTAssertNotEqual(vm.activeTool, .text)
    }

    func test_addMention_withABlankUsername_posesNothing() {
        let vm = StoryComposerViewModel()

        XCTAssertNil(vm.addMention(username: "   "))
        XCTAssertTrue(vm.currentEffects.textObjects.isEmpty)
    }
}
