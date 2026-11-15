import XCTest
import MeeshySDK
@testable import MeeshyUI

/// **Aucune puce « Reposté de @auteur »** (décision porteur 2026-10-13, #10524) :
/// le crédit vit dans l'en-tête, après la date. Ce qui reste du type est le
/// retrait de la puce qu'une story publiée avant la règle porte encore.
@MainActor
final class StoryRepostCreditTests: XCTestCase {

    func test_laPuceHéritée_estRetirée_etLeTexteDeLAuteurReste() {
        let herite = StoryTextObject(id: "herite", text: "Reposté de @racine", isLocked: true)
        let auteur = StoryTextObject(text: "mon texte à moi")
        let restant = StoryRepostCredit.stripped(from: [herite, auteur])
        XCTAssertEqual(restant.map(\.text), ["mon texte à moi"],
                       "la puce héritée part, le texte de l'auteur reste")
    }

    func test_leRetrait_neToucheJamaisLeTexteDeLAuteur() {
        let textes = [StoryTextObject(text: "un"), StoryTextObject(text: "deux")]
        XCTAssertEqual(StoryRepostCredit.stripped(from: textes).count, 2)
    }
}
