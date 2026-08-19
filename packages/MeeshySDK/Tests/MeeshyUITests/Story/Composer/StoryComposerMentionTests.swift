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
///
/// Le badge est le mode PINNED de la référence : c'est `addReference` qui le
/// pose, et lui seul.
@MainActor
final class StoryComposerMentionTests: XCTestCase {

    private func pin(_ username: String, userId: String = "u-1", on vm: StoryComposerViewModel) {
        vm.addReference(ComposerReference(username: username, userId: userId, display: .pinned))
    }

    func test_addReference_pinned_posesAHandleBadgeOnTheCurrentSlide() throws {
        let vm = StoryComposerViewModel()

        pin("alice", on: vm)

        let badge = try XCTUnwrap(vm.currentEffects.textObjects.first)
        XCTAssertEqual(badge.text, "@alice")
        XCTAssertEqual(vm.currentEffects.textObjects.count, 1)
    }

    /// Elle vit dans les EFFETS — la seule unité que le dépôt persiste et que le
    /// serveur reçoit.
    func test_addReference_pinned_writesIntoTheSlideEffects() {
        let vm = StoryComposerViewModel()

        pin("alice", on: vm)

        XCTAssertEqual(vm.currentSlide.effects.textObjects.count, 1)
    }

    /// Sans `referenceUserId`, le serveur relirait la pastille comme une
    /// mention de TEXTE et écraserait le mode choisi par l'auteur : c'est le
    /// seul champ qui distingue un badge d'une phrase.
    func test_addReference_pinned_marksTheBadgeWithItsUserId() throws {
        let vm = StoryComposerViewModel()

        pin("alice", userId: "u-a", on: vm)

        XCTAssertEqual(try XCTUnwrap(vm.currentEffects.textObjects.first).referenceUserId, "u-a")
    }

    /// Le fond plein est la SEULE chose qui la fait lire comme une étiquette et
    /// non comme du texte libre.
    func test_addReference_pinned_readsAsALabel_notAsFreeText() throws {
        let vm = StoryComposerViewModel()

        pin("alice", on: vm)

        let badge = try XCTUnwrap(vm.currentEffects.textObjects.first)
        guard case .solid = badge.backgroundStyle else {
            return XCTFail("La pastille doit porter un fond plein.")
        }
    }

    func test_addReference_pinned_promotesTheBadgeAboveExistingElements() throws {
        let vm = StoryComposerViewModel()
        let textId = try XCTUnwrap(vm.addText()?.id)

        pin("alice", on: vm)

        let badgeId = try XCTUnwrap(vm.currentEffects.textObjects.last?.id)
        XCTAssertGreaterThan(vm.zIndex(for: badgeId), vm.zIndex(for: textId),
                             "Un élément fraîchement posé arrive au premier plan.")
    }

    /// Deux mentions d'affilée ne doivent pas se superposer exactement — même
    /// cascade que les lieux et les stickers.
    func test_addReference_pinned_cascadesSoTwoBadgesNeverOverlapExactly() throws {
        let vm = StoryComposerViewModel()

        pin("alice", userId: "u-a", on: vm)
        pin("bob", userId: "u-b", on: vm)

        let badges = vm.currentEffects.textObjects
        XCTAssertEqual(badges.count, 2)
        XCTAssertNotEqual(badges[0].y, badges[1].y, accuracy: 0.0001)
    }

    /// Le geste s'achève à la pose. Basculer sur l'outil texte obligerait à
    /// refermer un panneau d'édition pour épingler une seconde personne.
    func test_addReference_pinned_doesNotOpenTheTextEditor() {
        let vm = StoryComposerViewModel()

        pin("alice", on: vm)

        XCTAssertNotEqual(vm.activeTool, .text)
    }

    func test_addReference_withABlankUsername_posesNothing() {
        let vm = StoryComposerViewModel()

        pin("   ", on: vm)

        XCTAssertTrue(vm.currentEffects.textObjects.isEmpty)
        XCTAssertTrue(vm.references.isEmpty)
    }

    /// Un badge dont on ignore la personne ne serait attribuable par personne :
    /// le serveur l'exclut de sa relecture de texte, et rien ne le déclarerait.
    func test_addReference_pinned_withoutAUserId_posesNoBadge() {
        let vm = StoryComposerViewModel()

        vm.addReference(ComposerReference(username: "alice", userId: nil, display: .pinned))

        XCTAssertTrue(vm.currentEffects.textObjects.isEmpty)
    }
}
