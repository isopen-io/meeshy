import XCTest
@testable import Meeshy

// MARK: - Un seul retour au bas du fil (#8001, directive porteur 2026-09-26)

// Hors du bas du fil, deux contrôles se montraient pour la même intention :
// la bulle dynamique « retour en bas » (aperçu du dernier message, frappe,
// compteur) ET une capsule texte « Messages récents » posée au-dessus du
// composeur quand la fenêtre de messages était centrée sur un message
// ancien (citation tapée, résultat de recherche). « Le composant dynamique
// suffit » : la capsule est retirée, et la bulle reprend son seul rôle
// propre — revenir à la fenêtre la plus récente — pour que rien ne se perde.
@MainActor
final class ConversationSingleReturnToBottomTests: XCTestCase {

    // MARK: - Loi de visibilité de la bulle

    func test_showsScrollToBottomButton_awayFromBottom_isTrue() {
        XCTAssertTrue(ConversationView.showsScrollToBottomButton(
            isNearBottom: false, isSearchingQuotedMessage: false, isInJumpedState: false
        ))
    }

    func test_showsScrollToBottomButton_atBottomOfLatestWindow_isFalse() {
        XCTAssertFalse(ConversationView.showsScrollToBottomButton(
            isNearBottom: true, isSearchingQuotedMessage: false, isInJumpedState: false
        ))
    }

    func test_showsScrollToBottomButton_searchingQuotedMessage_isTrue() {
        XCTAssertTrue(ConversationView.showsScrollToBottomButton(
            isNearBottom: true, isSearchingQuotedMessage: true, isInJumpedState: false
        ))
    }

    /// Le bas d'une fenêtre SAUTÉE n'est pas le bas du fil : la capsule
    /// « Messages récents » y était le seul chemin vers le présent. Retirée,
    /// c'est la bulle qui doit rester là.
    func test_showsScrollToBottomButton_atBottomOfJumpedWindow_isTrue() {
        XCTAssertTrue(ConversationView.showsScrollToBottomButton(
            isNearBottom: true, isSearchingQuotedMessage: false, isInJumpedState: true
        ))
    }

    // MARK: - Absence de la capsule « Messages récents »

    private func viewsDirectory() -> URL {
        URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()   // Views/
            .deletingLastPathComponent()   // Unit/
            .deletingLastPathComponent()   // MeeshyTests/
            .deletingLastPathComponent()   // ios/
            .appendingPathComponent("Meeshy/Features/Main/Views")
    }

    private func conversationViewSources() throws -> String {
        let files = try FileManager.default.contentsOfDirectory(at: viewsDirectory(), includingPropertiesForKeys: nil)
            .filter { $0.lastPathComponent.hasPrefix("ConversationView") && $0.pathExtension == "swift" }
        XCTAssertFalse(files.isEmpty)
        return try files.map { try String(contentsOf: $0, encoding: .utf8) }.joined(separator: "\n")
    }

    func test_conversationView_mountsNoSecondReturnControl() throws {
        let source = try conversationViewSources()
        XCTAssertFalse(source.contains("returnToLatestButton"),
                       "La capsule « Messages récents » double la bulle de retour en bas (#8001).")
        XCTAssertFalse(source.contains("conversation.view.recent_messages"))
        XCTAssertFalse(source.contains("conversation.view.return_to_recent"))
    }

    func test_scrollToBottomButton_returnsToLatestWindowWhenJumped() throws {
        let source = try String(
            contentsOf: viewsDirectory().appendingPathComponent("ConversationView+ScrollIndicators.swift"),
            encoding: .utf8
        )
        XCTAssertTrue(source.contains("viewModel.returnToLatest()"),
                      "La bulle de retour en bas ramène la fenêtre la plus récente quand le fil a sauté (#8001).")
        XCTAssertTrue(source.contains("ConversationScrollControlsView("),
                      "La bulle dynamique de retour en bas reste montée.")
    }

    func test_conversationView_gatesBubbleThroughVisibilityLaw() throws {
        let source = try conversationViewSources()
        XCTAssertTrue(source.contains("Self.showsScrollToBottomButton("),
                      "Le montage de la bulle passe par la loi testée, pas par une condition recopiée.")
    }
}
