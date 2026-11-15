import XCTest
import UIKit
@testable import MeeshyUI
@testable import MeeshySDK

/// **La saisie cède au doigt** (#8540, retour porteur 2026-09-28) : dans
/// l'éditeur d'objet, un geste de manipulation suspend la saisie et rend le
/// texte à sa place ; toucher le texte la reprend.
@MainActor
final class StoryCanvasInlineEditYieldTests: XCTestCase {

    private func canvas(yields: Bool) -> StoryCanvasUIView {
        let texte = StoryTextObject(id: "t", text: "Bonjour")
        let slide = StorySlide(id: "s", effects: StoryEffects(textObjects: [texte]), duration: 6, order: 0)
        let vue = StoryCanvasUIView(slide: slide, mode: .edit)
        vue.frame = CGRect(x: 0, y: 0, width: 402, height: 714)
        vue.layoutIfNeeded()
        vue.inlineEditYieldsToManipulation = yields
        vue.beginInlineTextEdit(textId: "t")
        return vue
    }

    func test_unGeste_suspendLaSaisie_quandLHoteLOpte() {
        let vue = canvas(yields: true)
        XCTAssertEqual(vue.inlineEditingTextId, "t")
        vue.suspendInlineEditForManipulation()
        XCTAssertNil(vue.inlineEditingTextId, "le texte quitte la saisie et retrouve sa place")
        XCTAssertEqual(vue.suspendedInlineEditId, "t")
    }

    func test_sansOptIn_laSaisieNeCedePas() {
        let vue = canvas(yields: false)
        vue.suspendInlineEditForManipulation()
        XCTAssertEqual(vue.inlineEditingTextId, "t", "la scène de la première vue garde son comportement")
    }

    func test_toucherLeTexte_reprendLaSaisie() {
        let vue = canvas(yields: true)
        vue.suspendInlineEditForManipulation()
        XCTAssertFalse(vue.resumeSuspendedInlineEdit(tappedId: "autre"))
        XCTAssertTrue(vue.resumeSuspendedInlineEdit(tappedId: "t"))
        XCTAssertEqual(vue.inlineEditingTextId, "t")
        XCTAssertNil(vue.suspendedInlineEditId)
    }

    /// Un geste qui commence SUR le champ désigne le texte suspendu, même si le
    /// calque, rendu à sa vraie place, n'est pas sous le doigt.
    func test_unGesteSurLeChamp_designeLeTexteSuspendu() throws {
        let vue = canvas(yields: true)
        let champ = try XCTUnwrap(vue.inlineEditor)
        let point = CGPoint(x: champ.frame.midX, y: champ.frame.midY)
        XCTAssertEqual(vue.suspendInlineEditForManipulation(at: point), "t")
    }

    func test_leChampEstGare_puisLibereALaFinDuGeste() {
        let vue = canvas(yields: true)
        vue.suspendInlineEditForManipulation()
        XCTAssertNotNil(vue.parkedInlineEditor, "le champ reste dans la hiérarchie pendant le geste")
        XCTAssertTrue(vue.parkedInlineEditor?.isHidden ?? false)
        vue.releaseParkedInlineEditor()
        XCTAssertNil(vue.parkedInlineEditor)
    }
}
