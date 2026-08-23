import XCTest
@testable import Meeshy

// MARK: - MyStoriesTabResolverTests
//
// Décisions d'étagère de « Mes stories » : quel onglet s'ouvre, quels onglets
// sont visibles (C7a — la File et l'Archive n'apparaissent qu'avec de la
// matière), et quand un onglet montre son état vide. Le cas critique reste
// l'utilisateur dont TOUTES les publications échouent : rien de publié, mais
// un échec en attente dans la File — l'ouvrir sur « Publiées » vide serait le
// laisser sans issue.
@MainActor
final class MyStoriesTabResolverTests: XCTestCase {

    // MARK: - initialTab

    func test_initialTab_hasPublishedStories_landsOnPublished() {
        XCTAssertEqual(
            MyStoriesTabResolver.initialTab(hasPublishedStories: true, hasQueueWork: false, hasDraftWork: false),
            .published
        )
    }

    func test_initialTab_publishedAndQueueWork_publishedWins() {
        XCTAssertEqual(
            MyStoriesTabResolver.initialTab(hasPublishedStories: true, hasQueueWork: true, hasDraftWork: true),
            .published
        )
    }

    func test_initialTab_everythingFails_landsOnQueue() {
        XCTAssertEqual(
            MyStoriesTabResolver.initialTab(hasPublishedStories: false, hasQueueWork: true, hasDraftWork: true),
            .queue,
            "Rien de publié + un upload ou un échec en attente → atterrir sur « File », pas « Brouillons »"
        )
    }

    func test_initialTab_onlyDraftWork_landsOnDrafts() {
        XCTAssertEqual(
            MyStoriesTabResolver.initialTab(hasPublishedStories: false, hasQueueWork: false, hasDraftWork: true),
            .drafts
        )
    }

    func test_initialTab_nothingAtAll_landsOnPublished() {
        XCTAssertEqual(
            MyStoriesTabResolver.initialTab(hasPublishedStories: false, hasQueueWork: false, hasDraftWork: false),
            .published
        )
    }

    // MARK: - visibleTabs

    func test_visibleTabs_noQueueNoArchive_onlyPublishedAndDrafts() {
        XCTAssertEqual(
            MyStoriesTabResolver.visibleTabs(hasQueueWork: false, hasArchivedStories: false),
            [.published, .drafts],
            "Sans matière, « File » et « Archive » restent absentes — jamais grisées, jamais vides"
        )
    }

    func test_visibleTabs_queueWorkOnly_insertsQueueBeforeDrafts() {
        XCTAssertEqual(
            MyStoriesTabResolver.visibleTabs(hasQueueWork: true, hasArchivedStories: false),
            [.published, .queue, .drafts]
        )
    }

    func test_visibleTabs_archivedStoriesOnly_appendsArchiveLast() {
        XCTAssertEqual(
            MyStoriesTabResolver.visibleTabs(hasQueueWork: false, hasArchivedStories: true),
            [.published, .drafts, .archive]
        )
    }

    func test_visibleTabs_queueAndArchive_allFourInOrder() {
        XCTAssertEqual(
            MyStoriesTabResolver.visibleTabs(hasQueueWork: true, hasArchivedStories: true),
            [.published, .queue, .drafts, .archive]
        )
    }

    // MARK: - shouldShowEmptyState (Publiées)

    func test_publishedTab_emptyState_onlyWhenNoPublishedStories() {
        XCTAssertTrue(MyStoriesTabResolver.shouldShowEmptyState(
            tab: .published, hasPublishedStories: false,
            hasDrafts: true, hasActiveUpload: true, hasFailedItems: true, hasArchivedStories: true
        ), "Le travail non publié n'écarte pas l'état vide de « Publiées »")

        XCTAssertFalse(MyStoriesTabResolver.shouldShowEmptyState(
            tab: .published, hasPublishedStories: true,
            hasDrafts: false, hasActiveUpload: false, hasFailedItems: false, hasArchivedStories: false
        ))
    }

    // MARK: - shouldShowEmptyState (File)

    func test_queueTab_emptyState_onlyWhenNoUploadAndNoFailure() {
        XCTAssertTrue(MyStoriesTabResolver.shouldShowEmptyState(
            tab: .queue, hasPublishedStories: true,
            hasDrafts: true, hasActiveUpload: false, hasFailedItems: false, hasArchivedStories: true
        ), "Publiées/Brouillons/Archive n'écartent pas l'état vide de « File »")

        XCTAssertFalse(MyStoriesTabResolver.shouldShowEmptyState(
            tab: .queue, hasPublishedStories: false,
            hasDrafts: false, hasActiveUpload: true, hasFailedItems: false, hasArchivedStories: false
        ))

        XCTAssertFalse(MyStoriesTabResolver.shouldShowEmptyState(
            tab: .queue, hasPublishedStories: false,
            hasDrafts: false, hasActiveUpload: false, hasFailedItems: true, hasArchivedStories: false
        ))
    }

    // MARK: - shouldShowEmptyState (Brouillons)

    func test_draftsTab_emptyState_onlyWhenNoDrafts() {
        XCTAssertTrue(MyStoriesTabResolver.shouldShowEmptyState(
            tab: .drafts, hasPublishedStories: true,
            hasDrafts: false, hasActiveUpload: true, hasFailedItems: true, hasArchivedStories: true
        ), "La File (uploads/échecs) n'écarte plus l'état vide de « Brouillons » — elle a son propre onglet")

        XCTAssertFalse(MyStoriesTabResolver.shouldShowEmptyState(
            tab: .drafts, hasPublishedStories: false,
            hasDrafts: true, hasActiveUpload: false, hasFailedItems: false, hasArchivedStories: false
        ))
    }

    // MARK: - shouldShowEmptyState (Archive)

    func test_archiveTab_emptyState_onlyWhenNoArchivedStories() {
        XCTAssertTrue(MyStoriesTabResolver.shouldShowEmptyState(
            tab: .archive, hasPublishedStories: true,
            hasDrafts: true, hasActiveUpload: true, hasFailedItems: true, hasArchivedStories: false
        ))

        XCTAssertFalse(MyStoriesTabResolver.shouldShowEmptyState(
            tab: .archive, hasPublishedStories: false,
            hasDrafts: false, hasActiveUpload: false, hasFailedItems: false, hasArchivedStories: true
        ))
    }
}
