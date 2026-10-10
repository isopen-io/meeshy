import XCTest
@testable import Meeshy

// MARK: - StoryViewerExportRailTests
//
// Le rail de l'auteur porte « Enregistrer », que l'anneau de progression
// remplace pendant un job de sauvegarde. Son bouton « Partager » (export vidéo)
// est parti (#9953) : le menu « … » offre « Partager ▸ Exporter en vidéo » à
// TOUT lecteur, la même feuille au choix de la langue. « Envoyer » reste au
// rail, pour tous.
//
// `StoryExportRailButtons.resolve` est un résolveur PUR extrait de
// `StoryActionSidebarView.sidebarContent` précisément pour être testé sans
// monter de vue SwiftUI (pas de cible UI-test dans ce projet).
final class StoryViewerExportRailTests: XCTestCase {

    // MARK: - Story de l'auteur

    func test_authorStory_noSaveInFlight_showsSaveButton() {
        let buttons = StoryExportRailButtons.resolve(showsExport: true, saveProgress: nil)

        XCTAssertTrue(buttons.showsSaveButton)
        XCTAssertFalse(buttons.showsSaveProgressRing)
    }

    // MARK: - Story qui n'est pas de l'auteur

    func test_notAuthorStory_hidesSave_regardlessOfSaveProgress() {
        let idle = StoryExportRailButtons.resolve(showsExport: false, saveProgress: nil)
        XCTAssertFalse(idle.showsSaveButton)
        XCTAssertFalse(idle.showsSaveProgressRing)

        // `showsExport` reste le SEUL déterminant, jamais `saveProgress` seul.
        let withStaleProgress = StoryExportRailButtons.resolve(showsExport: false, saveProgress: 0.5)
        XCTAssertFalse(withStaleProgress.showsSaveButton)
        XCTAssertFalse(withStaleProgress.showsSaveProgressRing)
    }

    // MARK: - Job de sauvegarde en vol

    func test_authorStory_saveInFlight_replacesSaveButtonWithRing() {
        let buttons = StoryExportRailButtons.resolve(showsExport: true, saveProgress: 0.42)

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

    // MARK: - #9953 : plus de « Partager » au rail de l'auteur, « Envoyer » reste

    private func sidebar() throws -> String {
        try MyStoriesSourceCorpus.text(of: "Meeshy/Features/Main/Views/StoryViewerView+Sidebar.swift")
    }

    func test_theAuthorRail_noLongerCarriesTheShareButton() throws {
        let rail = try sidebar()
        XCTAssertFalse(rail.contains("showExportShareSheet"), "Le rail n'ouvre plus la feuille d'export.")
        XCTAssertFalse(rail.contains("story.viewer.action.share"), "Plus de bouton « Partager » au rail.")
        XCTAssertFalse(rail.contains("square.and.arrow.up.fill"))
    }

    func test_send_staysOnTheRail_forEveryReader() throws {
        XCTAssertTrue(try sidebar().contains("story.viewer.action.send"))
        let plan = StoryActionRailPlan.resolve(isOwnStory: true, canReply: false, isPublicStory: false,
                                               hasAudibleSound: false, commentCount: 0, hasTranslatableContent: false)
        XCTAssertTrue(plan.showsForward, "« Envoyer » transfère n'importe où dans l'app — auteur compris.")
        let other = StoryActionRailPlan.resolve(isOwnStory: false, canReply: true, isPublicStory: false,
                                                hasAudibleSound: false, commentCount: 0, hasTranslatableContent: false)
        XCTAssertTrue(other.showsForward)
    }
}
