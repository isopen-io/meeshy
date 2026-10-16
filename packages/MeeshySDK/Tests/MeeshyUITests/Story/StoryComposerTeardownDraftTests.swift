import XCTest
@testable import MeeshyUI

/// Une fenêtre d'iPad redimensionnée de compact à regular reconstruit toute la
/// hiérarchie : le composer est DÉMONTÉ sans que l'auteur l'ait fermé. Sans
/// écriture à ce démontage, les dernières secondes d'édition (l'autosave est
/// débouncé) et le composer lui-même disparaissaient. Un démontage n'est pas
/// une sortie : le brouillon s'écrit et s'annonce, pour que la racine suivante
/// rouvre le composer dessus.
@MainActor
final class StoryComposerTeardownDraftTests: XCTestCase {

    func test_aTeardown_keepsTheDraft() {
        XCTAssertTrue(StoryComposerView.teardownKeepsDraft(didRequestExit: false, didHandOffPublish: false))
    }

    /// La croix écrit déjà le brouillon et FERME : rien à rouvrir.
    func test_anExplicitExit_isNotATeardown() {
        XCTAssertFalse(StoryComposerView.teardownKeepsDraft(didRequestExit: true, didHandOffPublish: false))
    }

    /// Publiée, la story n'est plus un brouillon : rien à rouvrir.
    func test_aPublishedStory_isNotATeardown() {
        XCTAssertFalse(StoryComposerView.teardownKeepsDraft(didRequestExit: false, didHandOffPublish: true))
    }

    func test_theComposer_announcesItsDraftOnTeardown_andItsReturnOnAppear() throws {
        let dir = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent()
        let view = try String(contentsOf: dir.appendingPathComponent("Sources/MeeshyUI/Story/StoryComposerView.swift"), encoding: .utf8)
        XCTAssertTrue(view.contains("post(name: .storyComposerTornDown"), "le démontage annonce le brouillon")
        XCTAssertTrue(view.contains("post(name: .storyComposerAppeared"), "le retour du composer efface l'annonce")
        let publication = try String(contentsOf: dir.appendingPathComponent("Sources/MeeshyUI/Story/StoryComposerView+Publication.swift"), encoding: .utf8)
        let dismiss = try XCTUnwrap(publication.range(of: "func handleDismiss() {"))
        XCTAssertTrue(publication[dismiss.upperBound...].prefix(120).contains("didRequestExit = true"))
    }
}
