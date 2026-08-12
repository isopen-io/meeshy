import XCTest
@testable import Meeshy

/// Source-analysis guard for the "Créer une story" entry point added to
/// `MyStoriesView`. Directive user 2026-07-14.
final class MyStoriesCreateStoryGuardTests: XCTestCase {

    /// Le fichier principal est lu comme un CORPUS — les gardes cherchent
    /// dans tous les fichiers de « Mes stories », pour survivre a sa
    /// decomposition. Tout autre chemin est lu tel quel.
    private func source(_ relativePath: String) throws -> String {
        relativePath.hasSuffix("MyStoriesView.swift")
            ? MyStoriesSourceCorpus.text()
            : try MyStoriesSourceCorpus.text(of: relativePath)
    }

    func test_myStoriesView_declaresOnCreateStoryCallback() throws {
        let viewSource = try source("Meeshy/Features/Main/Views/MyStoriesView.swift")

        XCTAssertTrue(
            viewSource.contains("let onCreateStory: () -> Void"),
            "MyStoriesView doit exposer un callback onCreateStory délégué au parent (même pattern que onOpen)."
        )
        XCTAssertTrue(
            viewSource.contains("onCreateStory()"),
            "Le bouton + de la toolbar doit appeler onCreateStory()."
        )
    }

    /// S5 — le câblage a déménagé de `StoryTrayView` vers le modifier partagé
    /// `myStoriesSheet` (`StoryTrayActions.swift`) : les deux surfaces de trail
    /// montaient la sheet chacune de son côté, avec leur propre règle de
    /// chaînage. L'invariant, lui, est inchangé — la sheet se ferme AVANT que
    /// le composer soit présenté ; c'est simplement `onDismiss` qui l'ordonne
    /// désormais, au lieu d'un `Task.sleep(350ms)`.
    func test_storyTrayActions_wiresOnCreateStory_closingSheetBeforeComposer() throws {
        let actions = try source("Meeshy/Features/Main/Views/StoryTrayActions.swift")

        guard let callbackRange = actions.range(of: "onCreateStory: {") else {
            XCTFail("Le modifier myStoriesSheet doit fournir onCreateStory: à MyStoriesView")
            return
        }
        let end = actions.index(callbackRange.lowerBound, offsetBy: 300, limitedBy: actions.endIndex)
            ?? actions.endIndex
        let block = String(actions[callbackRange.lowerBound ..< end])

        XCTAssertTrue(
            block.contains("schedule(.createStory)"),
            "onCreateStory doit ENREGISTRER l'intention, pas l'exécuter. Bloc lu: \(block)"
        )
        XCTAssertTrue(
            block.contains("isPresented.wrappedValue = false"),
            "onCreateStory doit refermer la sheet ; `onDismiss` exécutera l'intention. Bloc lu: \(block)"
        )
        XCTAssertTrue(
            actions.contains("sheet(isPresented: isPresented, onDismiss:"),
            "Le chaînage passe par la primitive déterministe `onDismiss`, jamais par un délai."
        )
    }
}
