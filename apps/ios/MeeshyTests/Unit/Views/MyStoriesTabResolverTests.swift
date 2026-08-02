import XCTest
@testable import Meeshy

// MARK: - MyStoriesTabResolverTests
//
// Décisions d'ouverture de « Mes stories » : quel onglet s'ouvre, et quand un
// onglet montre son état vide. Le cas critique est l'utilisateur dont TOUTES
// les publications échouent : rien de publié, mais du travail en attente —
// l'ouvrir sur « Publiées » vide serait le laisser sans issue.
@MainActor
final class MyStoriesTabResolverTests: XCTestCase {

    // MARK: - initialTab

    func test_initialTab_hasPublishedStories_landsOnPublished() {
        XCTAssertEqual(
            MyStoriesTabResolver.initialTab(hasPublishedStories: true, hasPendingWork: false),
            .published
        )
    }

    func test_initialTab_publishedAndPendingWork_publishedWins() {
        XCTAssertEqual(
            MyStoriesTabResolver.initialTab(hasPublishedStories: true, hasPendingWork: true),
            .published
        )
    }

    func test_initialTab_everythingFails_landsOnDrafts() {
        XCTAssertEqual(
            MyStoriesTabResolver.initialTab(hasPublishedStories: false, hasPendingWork: true),
            .drafts,
            "Rien de publié + travail en attente (échecs, uploads, brouillons) → atterrir sur « Brouillons »"
        )
    }

    func test_initialTab_nothingAtAll_landsOnPublished() {
        XCTAssertEqual(
            MyStoriesTabResolver.initialTab(hasPublishedStories: false, hasPendingWork: false),
            .published
        )
    }

    // MARK: - shouldShowEmptyState (Publiées)

    func test_publishedTab_emptyState_onlyWhenNoPublishedStories() {
        XCTAssertTrue(MyStoriesTabResolver.shouldShowEmptyState(
            tab: .published, hasPublishedStories: false,
            hasDrafts: true, hasActiveUpload: true, hasFailedItems: true
        ), "Le travail non publié n'écarte pas l'état vide de « Publiées »")

        XCTAssertFalse(MyStoriesTabResolver.shouldShowEmptyState(
            tab: .published, hasPublishedStories: true,
            hasDrafts: false, hasActiveUpload: false, hasFailedItems: false
        ))
    }

    // MARK: - shouldShowEmptyState (Brouillons)

    func test_draftsTab_emptyState_allSourcesEmpty() {
        XCTAssertTrue(MyStoriesTabResolver.shouldShowEmptyState(
            tab: .drafts, hasPublishedStories: true,
            hasDrafts: false, hasActiveUpload: false, hasFailedItems: false
        ), "Des stories publiées n'écartent pas l'état vide de « Brouillons »")
    }

    func test_draftsTab_hasDraftsOnly_hidesEmptyState() {
        XCTAssertFalse(MyStoriesTabResolver.shouldShowEmptyState(
            tab: .drafts, hasPublishedStories: false,
            hasDrafts: true, hasActiveUpload: false, hasFailedItems: false
        ), "Des brouillons seuls suffisent à écarter l'état vide")
    }

    func test_draftsTab_hasActiveUploadOnly_hidesEmptyState() {
        XCTAssertFalse(MyStoriesTabResolver.shouldShowEmptyState(
            tab: .drafts, hasPublishedStories: false,
            hasDrafts: false, hasActiveUpload: true, hasFailedItems: false
        ))
    }

    func test_draftsTab_hasFailedItemsOnly_hidesEmptyState() {
        XCTAssertFalse(MyStoriesTabResolver.shouldShowEmptyState(
            tab: .drafts, hasPublishedStories: false,
            hasDrafts: false, hasActiveUpload: false, hasFailedItems: true
        ))
    }
}
