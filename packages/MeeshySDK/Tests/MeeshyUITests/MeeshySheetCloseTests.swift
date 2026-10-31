import SwiftUI
import XCTest
import MeeshySDK
@testable import MeeshyUI

/// **Une feuille hébergée hors d'une présentation système se ferme par son
/// hôte** (#13839). Le compositeur pose ses feuilles dans sa propre pile : là,
/// `@Environment(\.dismiss)` ne ferme rien, et chaque « Annuler » serait inerte.
@MainActor
final class MeeshySheetCloseTests: XCTestCase {

    func test_route_withHostClose_closesThroughTheHost() {
        XCTAssertEqual(MeeshySheetClose.route(hasHostClose: true), .host)
    }

    func test_route_withoutHostClose_keepsTheSystemDismiss() {
        XCTAssertEqual(MeeshySheetClose.route(hasHostClose: false), .system)
    }

    func test_perform_withHostClose_callsTheHostOnce() {
        var appels = 0
        MeeshySheetClose.perform(host: { appels += 1 }, system: { XCTFail("le système ne ferme rien ici") })
        XCTAssertEqual(appels, 1)
    }

    func test_perform_withoutHostClose_fallsBackToTheSystem() {
        var systeme = 0
        MeeshySheetClose.perform(host: nil, system: { systeme += 1 })
        XCTAssertEqual(systeme, 1)
    }

    func test_headerDone_withoutSelectionRequired_isEnabled() {
        XCTAssertTrue(MeeshySheetHeader.doneIsEnabled(canFinish: true))
        XCTAssertFalse(MeeshySheetHeader.doneIsEnabled(canFinish: false))
    }

    private let ana = ComposerReference(username: "ana", userId: "1", display: .silent)

    func test_mentionPicker_withNobodyChosen_greysItsOK() {
        XCTAssertFalse(StoryMentionPickerSheet.canFinish(references: [], initial: []))
        XCTAssertTrue(StoryMentionPickerSheet.canFinish(references: [ana], initial: []))
    }

    /// Retirer tout le monde EST une modification : sans OK, la seule touche
    /// active serait « Annuler », qui rend les mentions retirées.
    func test_mentionPicker_afterRemovingEveryone_letsOKValidateTheRemoval() {
        XCTAssertTrue(StoryMentionPickerSheet.canFinish(references: [], initial: [ana]))
    }

    /// Hébergée par le compositeur, la feuille Stickers prend le titre et l'OK
    /// de la feuille ancrée : son propre en-tête ferait un second « Stickers »,
    /// et son ✕ appelait `dismiss()`, qui fermait le COMPOSITEUR entier.
    func test_stickerPicker_hostedByAnAnchoredSheet_dropsItsOwnHeader() {
        XCTAssertFalse(StickerPickerView.showsOwnHeader(hostCloses: true))
        XCTAssertTrue(StickerPickerView.showsOwnHeader(hostCloses: false))
    }
}
