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

    // MARK: - #8898 : l'aperçu épouse le haut de la feuille, comme le web

    /// Directive porteur 2026-09-30 : « tout le bloc épouse l'entête arrondi
    /// puis ligne droite sur la bordure basse ». Le verre de l'aperçu n'est
    /// plus un rectangle arrondi flottant : il va d'un bord à l'autre, collé
    /// en haut (l'arrondi est celui de la feuille), et finit par une arête
    /// droite — `thread-header.tsx`, `inset-x-0 top-0`.
    func test_resolve_previewMode_isAnEdgeToEdgeBandWithAStraightBottomEdge() {
        let layout = ConversationHeaderLayout.resolve(previewMode: true, showOptions: false)
        XCTAssertEqual(layout.glassShape, .edgeToEdgeBand)
    }

    /// Le fil normal garde son bloc arrondi flottant quand il est déplié —
    /// #8898 ne touche que l'aperçu.
    func test_resolve_fullConversationUnfolded_keepsTheFloatingRoundedBlock() {
        XCTAssertEqual(ConversationHeaderLayout.resolve(previewMode: false, showOptions: true).glassShape, .floatingBlock)
        XCTAssertEqual(ConversationHeaderLayout.resolve(previewMode: false, showOptions: false).glassShape, .none)
    }

    /// La forme résolue n'a d'effet que si l'hôte PEINT son verre depuis elle.
    /// La fusion de #8903 a gardé l'ancien bloc arrondi dans `ConversationView`
    /// pendant que la bande prenait ses marges bord à bord : l'aperçu dessinait
    /// un rectangle arrondi collé aux bords, et aucun témoin de loi ne rougissait.
    func test_conversationView_paintsTheHeaderGlassFromTheResolvedShape() throws {
        let source = try String(contentsOf: Self.conversationViewSource(), encoding: .utf8)
        XCTAssertTrue(source.contains("ConversationHeaderGlass(shape: headerLayout.glassShape"))
        XCTAssertFalse(source.contains("RoundedRectangle(cornerRadius: MeeshyRadius.xxl - 2)"),
                       "le bloc arrondi vit dans `ConversationHeaderGlass`, jamais en double dans l'hôte")
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
