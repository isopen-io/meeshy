import XCTest
@testable import Meeshy

// MARK: - StoryViewerExportRailTests
//
// Task 10 — revue Task 7 : le rail du reader avait perdu tout accès au
// partage externe (WhatsApp, AirDrop, Messages) quand l'ancien bouton
// « Exporter » a été fait passer par `StoryPhotoSaveService`. Le rail porte
// désormais DEUX actions distinctes (Partager / Enregistrer), et l'anneau de
// progression ne concerne QUE Enregistrer — Partager doit rester au premier
// plan pendant tout un job de sauvegarde, sinon la share sheet système
// surgirait après coup, une fois l'utilisateur déjà reparti ailleurs.
//
// `StoryExportRailButtons.resolve` est un résolveur PUR extrait de
// `StoryActionSidebarView.sidebarContent` précisément pour être testé sans
// monter de vue SwiftUI (pas de cible UI-test dans ce projet).
final class StoryViewerExportRailTests: XCTestCase {

    // MARK: - Story de l'auteur

    func test_authorStory_noSaveInFlight_showsShareAndSaveButton() {
        let buttons = StoryExportRailButtons.resolve(showsExport: true, saveProgress: nil)

        XCTAssertTrue(buttons.showsShareButton)
        XCTAssertTrue(buttons.showsSaveButton)
        XCTAssertFalse(buttons.showsSaveProgressRing)
    }

    // MARK: - Story qui n'est pas de l'auteur

    func test_notAuthorStory_hidesShareAndSave_regardlessOfSaveProgress() {
        let idle = StoryExportRailButtons.resolve(showsExport: false, saveProgress: nil)
        XCTAssertFalse(idle.showsShareButton)
        XCTAssertFalse(idle.showsSaveButton)
        XCTAssertFalse(idle.showsSaveProgressRing)

        // Un job de sauvegarde ne peut normalement pas être en vol pour une
        // story qui n'est pas de l'auteur, mais le résolveur doit rester sûr
        // même sur cette entrée incohérente : `showsExport` reste le SEUL
        // déterminant, jamais `saveProgress` seul.
        let withStaleProgress = StoryExportRailButtons.resolve(showsExport: false, saveProgress: 0.5)
        XCTAssertFalse(withStaleProgress.showsShareButton)
        XCTAssertFalse(withStaleProgress.showsSaveButton)
        XCTAssertFalse(withStaleProgress.showsSaveProgressRing)
    }

    // MARK: - Job de sauvegarde en vol

    func test_authorStory_saveInFlight_replacesSaveButtonWithRing_keepsShareButton() {
        let buttons = StoryExportRailButtons.resolve(showsExport: true, saveProgress: 0.42)

        XCTAssertTrue(buttons.showsShareButton,
                      "Partager doit rester atteignable même pendant un job de sauvegarde en vol")
        XCTAssertFalse(buttons.showsSaveButton,
                       "Enregistrer est remplacé par l'anneau de progression tant que le job tourne")
        XCTAssertTrue(buttons.showsSaveProgressRing)
    }

    /// Bornes de progression (0 et 1) : toujours l'anneau, jamais le bouton.
    func test_authorStory_saveProgressAtBounds_stillShowsRingNotButton() {
        let atStart = StoryExportRailButtons.resolve(showsExport: true, saveProgress: 0)
        XCTAssertTrue(atStart.showsSaveProgressRing)
        XCTAssertFalse(atStart.showsSaveButton)

        let atEnd = StoryExportRailButtons.resolve(showsExport: true, saveProgress: 1)
        XCTAssertTrue(atEnd.showsSaveProgressRing)
        XCTAssertFalse(atEnd.showsSaveButton)
    }
}
