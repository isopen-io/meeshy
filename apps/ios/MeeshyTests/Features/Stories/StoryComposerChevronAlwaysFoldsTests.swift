import XCTest
@testable import Meeshy

/// **Sur une story, le chevron est TOUJOURS visible et replie TOUJOURS** (#9893,
/// porteur 2026-10-10).
///
/// Deux cas lui échappaient : pendant une prise vocale, la barre d'outils qui le
/// porte s'effaçait et lui avec ; pendant une réponse à un commentaire, il
/// fermait le clavier sans replier. Replier ne perd rien : la plaque reste
/// MONTÉE (hauteur nulle), donc la prise continue, la bannière « Réponse à X »
/// et le brouillon attendent la réouverture — et la bulle dit ce qu'elle garde.
final class StoryComposerChevronAlwaysFoldsTests: XCTestCase {

    // MARK: - Réponse à un commentaire

    func test_onTheStory_theChevronFolds_evenWhileReplying() {
        XCTAssertEqual(StoryComposerFold.readerPresentation(userFolded: true), .folded,
                       "La réponse en cours ne retient plus le composeur ouvert.")
        XCTAssertEqual(StoryComposerFold.readerPresentation(userFolded: false), .expanded)
    }

    func test_theChevron_isOfferedWheneverTheStoryComposerIsOpen() {
        XCTAssertTrue(StoryComposerFold.offersFoldButton(
            presentation: StoryComposerFold.readerPresentation(userFolded: false)))
    }

    /// Le fil et le détail d'un post gardent leur règle : la réponse y rouvre
    /// toujours le composeur.
    func test_feedAndPostComments_keepTheirReplyRule() {
        XCTAssertEqual(StoryComposerFold.presentation(userFolded: true, isReplying: true), .expanded)
    }

    /// Replier garde la réponse ; seule une NOUVELLE demande de réponse rouvre
    /// le composeur.
    func test_onlyANewReplyRequest_unfolds() {
        XCTAssertTrue(StoryComposerFold.unfoldsOnReply(from: nil, to: "c1"))
        XCTAssertTrue(StoryComposerFold.unfoldsOnReply(from: "c1", to: "c2"))
        XCTAssertFalse(StoryComposerFold.unfoldsOnReply(from: "c1", to: "c1"))
        XCTAssertFalse(StoryComposerFold.unfoldsOnReply(from: "c1", to: nil),
                       "Annuler ou envoyer la réponse ne rouvre rien.")
    }

    // MARK: - Ce que la bulle garde

    func test_theBubble_tellsWhatTheFoldKeeps() {
        XCTAssertEqual(StoryComposerFold.bubbleBadge(isRecording: true, isReplying: true), .recording,
                       "Une prise en cours se signale d'abord : c'est elle qu'on ne doit pas oublier.")
        XCTAssertEqual(StoryComposerFold.bubbleBadge(isRecording: false, isReplying: true), .reply)
        XCTAssertEqual(StoryComposerFold.bubbleBadge(isRecording: false, isReplying: false), .none)
    }

    // MARK: - Prise vocale

    func test_theFoldRow_survivesARecording_onlyWhenTheHostAsks() {
        XCTAssertTrue(ComposerFoldPlacement.rowDuringRecording(isRecording: true, survivesRecording: true))
        XCTAssertFalse(ComposerFoldPlacement.rowDuringRecording(isRecording: true, survivesRecording: false),
                       "Fils et posts : la barre d'enregistrement reste nue.")
        XCTAssertFalse(ComposerFoldPlacement.rowDuringRecording(isRecording: false, survivesRecording: true),
                       "Hors prise, le ⌄ vit dans la barre d'outils.")
    }

    // MARK: - Site

    func test_theStoryWiresTheChevronThatAlwaysFolds() throws {
        let root = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent().deletingLastPathComponent()
            .deletingLastPathComponent().deletingLastPathComponent()
        func read(_ path: String) throws -> String {
            AppSourceGuard.stripComments(try String(contentsOf: root.appendingPathComponent(path), encoding: .utf8))
        }
        let layer = try read("Meeshy/Features/Main/Views/StoryViewerView+CanvasComposerLayer.swift")
        XCTAssertTrue(layer.contains("StoryComposerFold.readerPresentation("))
        XCTAssertFalse(layer.contains("StoryComposerFold.presentation("),
                       "le lecteur ne lit plus la règle du fil")
        XCTAssertTrue(layer.contains("StoryComposerFold.unfoldsOnReply("))
        XCTAssertTrue(layer.contains("StoryComposerFold.bubbleBadge("))
        XCTAssertTrue(layer.contains("survivesRecording: true"))
        XCTAssertTrue(layer.contains(".frame(height: isFolded ? 0 : nil, alignment: .top)"),
                      "replié, la plaque reste montée : la prise, la réponse et le brouillon survivent")

        let bar = try read("Meeshy/Features/Main/Views/StoryViewerView+CanvasComposerBar.swift")
        XCTAssertTrue(bar.contains("isRecordingVoice = recording"))

        let layout = try read("Meeshy/Features/Main/Components/UniversalComposerBar+Layout.swift")
        XCTAssertTrue(layout.contains("ComposerFoldPlacement.rowDuringRecording("))
    }
}
