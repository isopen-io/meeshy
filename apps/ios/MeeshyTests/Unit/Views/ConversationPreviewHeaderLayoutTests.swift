import XCTest
@testable import Meeshy

// MARK: - L'aperçu tiré de la bannière : en-tête complet en verre, sans chevron (#8822)

// Exigence porteur du 2026-09-30 : « lorsqu'on ouvre l'aperçu, il faut
// absolument pouvoir scroller dans la conversation et afficher tout le header
// de la conversation dans son bloc de verre Liquid Glass sans (<) ! »
//
// La bande d'en-tête avait deux états — replié (retour, actions, avatar) et
// déplié (retour, titre et étiquettes dans le verre, avatar) — et l'aperçu
// héritait du premier : un chevron qui fait `router.pop()` sous une feuille, et
// aucune identité. L'aperçu a désormais SA disposition, résolue par une loi
// pure : tout l'en-tête, dans le verre, sans retour.
@MainActor
final class ConversationPreviewHeaderLayoutTests: XCTestCase {

    func test_resolve_previewMode_showsWholeHeaderInGlassWithoutBackButton() {
        let layout = ConversationHeaderLayout.resolve(previewMode: true, showOptions: false)

        XCTAssertFalse(layout.showsBackButton)
        XCTAssertTrue(layout.showsTitle)
        XCTAssertTrue(layout.showsActions)
        XCTAssertTrue(layout.isGlassBlock)
        XCTAssertTrue(layout.showsOpenFullConversation)
    }

    func test_resolve_previewModeWithOptionsOpen_staysTheSameWholeHeader() {
        XCTAssertEqual(
            ConversationHeaderLayout.resolve(previewMode: true, showOptions: true),
            ConversationHeaderLayout.resolve(previewMode: true, showOptions: false)
        )
    }

    func test_resolve_previewMode_keepsTheBandWhileTyping() {
        XCTAssertFalse(ConversationHeaderLayout.resolve(previewMode: true, showOptions: false).yieldsToTypingBar)
    }

    func test_resolve_previewMode_measuresTheBandSoTheListClearsIt() {
        XCTAssertTrue(ConversationHeaderLayout.resolve(previewMode: true, showOptions: false).measuresBandHeight)
    }

    func test_resolve_fullConversationFolded_keepsBackActionsAndAvatar() {
        let layout = ConversationHeaderLayout.resolve(previewMode: false, showOptions: false)

        XCTAssertTrue(layout.showsBackButton)
        XCTAssertFalse(layout.showsTitle)
        XCTAssertTrue(layout.showsActions)
        XCTAssertFalse(layout.isGlassBlock)
        XCTAssertFalse(layout.showsOpenFullConversation)
        XCTAssertTrue(layout.yieldsToTypingBar)
        XCTAssertTrue(layout.measuresBandHeight)
    }

    func test_resolve_fullConversationUnfolded_keepsBackAndShowsTitleInGlass() {
        let layout = ConversationHeaderLayout.resolve(previewMode: false, showOptions: true)

        XCTAssertTrue(layout.showsBackButton)
        XCTAssertTrue(layout.showsTitle)
        XCTAssertFalse(layout.showsActions)
        XCTAssertTrue(layout.isGlassBlock)
        XCTAssertFalse(layout.showsOpenFullConversation)
        XCTAssertFalse(layout.measuresBandHeight)
    }

    /// Le calque transparent qui interceptait tout toucher au-dessus du fil
    /// pour « ouvrir la conversation complète » empêchait le DÉFILEMENT : la
    /// liste UIKit ne recevait plus aucun geste. Il n'existe plus — ouvrir la
    /// conversation complète passe par un bouton de l'en-tête.
    func test_previewMode_noTapCatcherCoversTheMessageList() throws {
        let source = try String(contentsOf: Self.conversationViewSource(), encoding: .utf8)
        XCTAssertFalse(source.contains("onTapGesture { onOpenFullConversation?() }"))
    }

    private static func conversationViewSource() -> URL {
        URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .appendingPathComponent("Meeshy/Features/Main/Views/ConversationView.swift")
    }
}
