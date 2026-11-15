import XCTest
import UIKit
import MeeshySDK
@testable import Meeshy

/// Light integration coverage for the `StoryPublishService` bridge.
///
/// The service is a `@MainActor` singleton layered over the
/// `StoryPublishQueue.shared` actor, so each test resets the shared queue in
/// `setUp`. The queue's own enqueue/retry/persistence logic is covered by
/// `StoryPublishQueueTests` in the SDK — these tests only verify the bridge:
/// it delegates `pendingItems`, clears the queue, and refreshes its published
/// `pendingCount` on app foreground.
@MainActor
final class StoryPublishServiceTests: XCTestCase {

    private var service: StoryPublishService { StoryPublishService.shared }
    /// Brouillons — magasin TEMPORAIRE injecté dans le singleton pour la durée
    /// du test (`draftStore` est un `var`, restauré au `.shared` par défaut en
    /// tearDown : `StoryPublishService` est réutilisé par toute la suite).
    private var draftStoreRoot: URL!

    override func setUp() async throws {
        try await super.setUp()
        await StoryPublishQueue.shared.clearAll()
        draftStoreRoot = FileManager.default.temporaryDirectory
            .appendingPathComponent("StoryPublishServiceTests-\(UUID().uuidString)")
        try FileManager.default.createDirectory(at: draftStoreRoot, withIntermediateDirectories: true)
        service.draftStore = StoryDraftStore(
            dbPath: draftStoreRoot.appendingPathComponent("drafts.sqlite").path,
            mediaDirectory: draftStoreRoot.appendingPathComponent("media")
        )
    }

    override func tearDown() async throws {
        await StoryPublishQueue.shared.clearAll()
        service.draftStore = .shared
        if let draftStoreRoot { try? FileManager.default.removeItem(at: draftStoreRoot) }
        draftStoreRoot = nil
        try await super.tearDown()
    }

    // MARK: - Helpers

    private func makeItem(visibility: String = "PUBLIC", draftId: String? = nil) -> StoryPublishQueueItem {
        StoryPublishQueueItem(visibility: visibility, slidesPayload: Data("[]".utf8), draftId: draftId)
    }

    // MARK: - Cycle de vie du brouillon gelé (directive 2026-08-02)
    //
    // Chemin QUEUE (offline, ou repris au cold-start) : `publishSucceeded`/
    // `publishFailed` portent le `draftId` de l'item. Le succès en ligne
    // direct (piloté par `StoryViewModel.launchUploadTask`, silencieux côté
    // queue) et l'édition sont couverts par `StoryUploadQueueTests` (le VM
    // possède, lui, le mock `postService` nécessaire pour les driver).

    func test_publishSucceeded_deletesTheFrozenDraft() async {
        let draftId = "frozen-\(UUID().uuidString)"
        service.draftStore.save(draftId: draftId, slides: [StorySlide()], visibility: "PUBLIC")
        service.draftStore.markPendingPublish(draftId: draftId)
        service.configure()
        await StoryPublishQueue.shared.setPublishHandler { _ in "server-post-id" }
        let item = makeItem(draftId: draftId)
        _ = await StoryPublishQueue.shared.enqueue(item)

        await StoryPublishQueue.shared.processNext()

        for _ in 0..<200 where service.draftStore.load(draftId: draftId) != nil {
            await Task.yield()
        }
        XCTAssertNil(service.draftStore.load(draftId: draftId),
                     "Le succès serveur confirmé (repris par la file) efface le brouillon gelé")
    }

    func test_publishFailedPermanently_recordsErrorAndDethawsTheDraft() async {
        let draftId = "frozen-\(UUID().uuidString)"
        service.draftStore.save(draftId: draftId, slides: [StorySlide()], visibility: "PUBLIC")
        service.draftStore.markPendingPublish(draftId: draftId)
        service.configure()
        await StoryPublishQueue.shared.setPublishHandler { _ in
            throw StoryPublishUnrecoverableError("rejected")
        }
        let item = makeItem(draftId: draftId)
        _ = await StoryPublishQueue.shared.enqueue(item)

        await StoryPublishQueue.shared.processNext()

        for _ in 0..<200 where service.draftStore.load(draftId: draftId)?.lastPublishError == nil {
            await Task.yield()
        }
        let stored = try! XCTUnwrap(service.draftStore.load(draftId: draftId))
        XCTAssertNil(stored.pendingPublishAt, "Échec permanent → dégelé → de nouveau visible en reprise")
        XCTAssertNotNil(stored.lastPublishError, "L'erreur reste affichable jusqu'à la prochaine tentative")
    }

    /// Un item legacy (persisté avant `draftId`, `nil`) ne doit rien tenter
    /// sur le magasin — comportement inchangé, pas de crash sur un id absent.
    func test_publishSucceeded_withNoDraftId_doesNotTouchTheDraftStore() async {
        service.configure()
        await StoryPublishQueue.shared.setPublishHandler { _ in "server-post-id" }
        let item = makeItem(draftId: nil)
        _ = await StoryPublishQueue.shared.enqueue(item)

        await StoryPublishQueue.shared.processNext()

        for _ in 0..<200 {
            let pending = await StoryPublishQueue.shared.pendingItems
            if !pending.contains(where: { $0.id == item.id }) { break }
            await Task.yield()
        }
        // Rien à assert de positif sur le store (rien n'y a été écrit) — le
        // test réussit s'il ne crashe pas et que l'item a bien été drainé.
        let pending = await StoryPublishQueue.shared.pendingItems
        XCTAssertFalse(pending.contains { $0.id == item.id })
    }

    // MARK: - pendingItems

    func test_pendingItems_reflectsQueuedItems() async {
        let first = makeItem()
        let second = makeItem()
        _ = await StoryPublishQueue.shared.enqueue(first)
        _ = await StoryPublishQueue.shared.enqueue(second)

        let pending = await service.pendingItems()

        XCTAssertEqual(pending.count, 2)
        XCTAssertEqual(Set(pending.map(\.id)), [first.id, second.id])
    }

    func test_pendingItems_emptyWhenQueueEmpty() async {
        let pending = await service.pendingItems()

        XCTAssertTrue(pending.isEmpty)
    }

    // MARK: - clearAll

    func test_clearAll_emptiesQueueAndZeroesPendingCount() async {
        _ = await StoryPublishQueue.shared.enqueue(makeItem())
        _ = await StoryPublishQueue.shared.enqueue(makeItem())

        await service.clearAll()

        let pending = await service.pendingItems()
        XCTAssertTrue(pending.isEmpty)
        XCTAssertEqual(service.pendingCount, 0)
    }

    // MARK: - foreground refresh

    func test_foregroundNotification_refreshesPendingCount() async {
        // configure() is idempotent; calling it ensures the
        // willEnterForeground subscription is installed.
        service.configure()
        _ = await StoryPublishQueue.shared.enqueue(makeItem())
        _ = await StoryPublishQueue.shared.enqueue(makeItem())

        NotificationCenter.default.post(
            name: UIApplication.willEnterForegroundNotification, object: nil
        )

        // The subscription refreshes pendingCount on a hopped Task — yield
        // until it reflects the two queued items.
        for _ in 0..<200 where service.pendingCount != 2 {
            await Task.yield()
        }
        XCTAssertEqual(service.pendingCount, 2)
    }

    // MARK: - failedItems / retry / discard

    /// Drives a real permanent failure through the public queue API (same
    /// pattern as `StoryPublishQueueTests` in the SDK) and waits for the
    /// service's `publishFailed` subscriber (hopped via `receive(on: .main)`)
    /// to reflect it in `failedItems`.
    private func enqueueAndFailPermanently() async -> StoryPublishQueueItem {
        service.configure()
        await StoryPublishQueue.shared.setPublishHandler { _ in
            throw StoryPublishUnrecoverableError("rejected")
        }
        let item = makeItem()
        _ = await StoryPublishQueue.shared.enqueue(item)
        await StoryPublishQueue.shared.processNext()
        for _ in 0..<200 where service.failedItems.isEmpty {
            await Task.yield()
        }
        return item
    }

    func test_failedItems_emptyWhenQueueEmpty() {
        XCTAssertTrue(service.failedItems.isEmpty)
    }

    func test_failedItems_populatesAfterPermanentFailure() async {
        let item = await enqueueAndFailPermanently()
        XCTAssertEqual(service.failedItems.map(\.id), [item.id])
    }

    func test_retry_republishesAndClearsFromFailedItems() async {
        let item = await enqueueAndFailPermanently()

        // Retry re-enqueues and auto-drains immediately (SDK's M5 pattern) —
        // let this attempt succeed so the outcome (fully drained) is
        // deterministic instead of racing a still-throwing handler.
        await StoryPublishQueue.shared.setPublishHandler { _ in "server-ok" }
        await service.retry(item)

        for _ in 0..<200 {
            let pending = await service.pendingItems()
            if !pending.contains(where: { $0.id == item.id }) { break }
            await Task.yield()
        }
        let pending = await service.pendingItems()
        XCTAssertFalse(pending.contains { $0.id == item.id },
                       "a successful retry republishes the item and drains it from the queue")
        XCTAssertTrue(service.failedItems.isEmpty)
    }

    func test_discard_removesItemFromFailedItemsAndQueue() async {
        let item = await enqueueAndFailPermanently()

        await service.discard(service.failedItems[0])

        XCTAssertTrue(service.failedItems.isEmpty)
        let stillInQueue = await StoryPublishQueue.shared.failedPendingItems
        XCTAssertFalse(stillInQueue.contains { $0.id == item.id })
    }

    // MARK: - E10 : sweep des dossiers médias orphelins

    func test_orphanedQueueDirectories_keepsLiveAndRecentDirs() {
        let live = URL(fileURLWithPath: "/q/pending_live")
        let oldOrphan = URL(fileURLWithPath: "/q/pending_dead")
        let freshOrphan = URL(fileURLWithPath: "/q/pending_fresh")
        let now = Date()
        let dates: [String: Date] = [
            "pending_live": now.addingTimeInterval(-7200),
            "pending_dead": now.addingTimeInterval(-7200),
            "pending_fresh": now.addingTimeInterval(-60),
        ]

        let orphans = StoryPublishService.orphanedQueueDirectories(
            children: [live, oldOrphan, freshOrphan],
            liveTempIds: ["pending_live"],
            cutoff: now.addingTimeInterval(-3600),
            modificationDate: { dates[$0.lastPathComponent] }
        )

        XCTAssertEqual(orphans, [oldOrphan],
                       "Only unclaimed directories older than the cutoff are swept — live items and freshly created dirs (enqueue race) survive")
    }

    func test_orphanedQueueDirectories_missingMtime_treatedAsOld() {
        let unknown = URL(fileURLWithPath: "/q/pending_unknown")
        let orphans = StoryPublishService.orphanedQueueDirectories(
            children: [unknown], liveTempIds: [],
            cutoff: Date().addingTimeInterval(-3600),
            modificationDate: { _ in nil }
        )
        XCTAssertEqual(orphans, [unknown])
    }

    // MARK: - #14879 — une story en file garde son média jusqu'à l'envoi ou l'annulation

    /// Le conteneur de l'app change de chemin entre deux lancements : la file
    /// relue visait l'ancien, et le fichier, présent, était déclaré introuvable.
    func test_mediaReference_decodedAfterAContainerMove_pointsIntoTheCurrentContainer() throws {
        let ancien = "/Users/x/Library/Developer/CoreSimulator/Devices/D/data/Containers/Data/Application/75F6D7AA-C98C-4D5D-82DD-163055A01D5A"
        let rest = "/Documents/meeshy_offline_queue/pending_A/photo.jpg"
        let json = Data(#"{"elementId":"e1","mediaType":"image","localFilePath":"\#(ancien + rest)"}"#.utf8)

        let ref = try JSONDecoder().decode(StoryMediaReference.self, from: json)

        XCTAssertEqual(ref.localFilePath, NSHomeDirectory() + rest)
    }

    func test_rebasing_leavesAPathOfTheCurrentContainerOrOutsideAnyContainerUntouched() {
        let home = "/var/mobile/Containers/Data/Application/AAAA"
        XCTAssertEqual(StoryMediaReference.rebasing(home + "/Documents/a.jpg", ontoHome: home), home + "/Documents/a.jpg")
        XCTAssertEqual(StoryMediaReference.rebasing("/tmp/a.jpg", ontoHome: home), "/tmp/a.jpg")
        XCTAssertEqual(
            StoryMediaReference.rebasing("/private/var/mobile/Containers/Data/Application/BBBB/Documents/a.jpg", ontoHome: home),
            home + "/Documents/a.jpg"
        )
    }

    /// Le balayage de démarrage gardait les seuls dossiers de la file
    /// d'attente : une story en échec perdait son média après une heure, et
    /// « Réessayer » ne trouvait plus rien.
    func test_liveTempStoryIds_keepTheMediaOfFailedStories() {
        let enAttente = makeItem(tempStoryId: "pending_A")
        let enEchec = makeItem(tempStoryId: "pending_B")

        XCTAssertEqual(StoryPublishService.liveTempStoryIds(pending: [enAttente], failed: [enEchec]),
                       ["pending_A", "pending_B"])
    }

    func test_cancelSend_isOfferedWhileNothingIsInFlight() {
        typealias Phase = StoryViewModel.StoryUploadState.UploadPhase
        XCTAssertTrue(StoryUploadPresentation.offersCancelSend(Phase.failed("hors ligne")), "un échec reste annulable, pas seulement relançable")
        XCTAssertTrue(StoryUploadPresentation.offersCancelSend(Phase.queued))
        XCTAssertFalse(StoryUploadPresentation.offersCancelSend(Phase.uploading))
        XCTAssertFalse(StoryUploadPresentation.offersCancelSend(Phase.publishing))
    }

    func test_failureText_missingMedia_speaksTheInterfaceLanguage() {
        XCTAssertEqual(
            StoryFailureText.display(StoryPublishQueue.missingLocalMediaError),
            String(localized: "story.mine.failed.missingMedia", defaultValue: "Un média local est introuvable", bundle: .main)
        )
        XCTAssertEqual(StoryFailureText.display("Server said no"), "Server said no")
        XCTAssertNil(StoryFailureText.display(nil))
    }

    func test_missingMediaKey_isTranslatedInTheSevenLanguages() throws {
        let catalogue = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent()
            .deletingLastPathComponent()
            .appendingPathComponent("Meeshy/Localizable.xcstrings")
        let racine = try XCTUnwrap(JSONSerialization.jsonObject(with: Data(contentsOf: catalogue)) as? [String: Any])
        let cles = try XCTUnwrap(racine["strings"] as? [String: Any])
        let entree = try XCTUnwrap(cles["story.mine.failed.missingMedia"] as? [String: Any])
        let langues = try XCTUnwrap(entree["localizations"] as? [String: Any])
        XCTAssertEqual(Set(langues.keys), ["fr", "en", "es", "de", "it", "pt-BR", "ar"])
    }

    private func makeItem(tempStoryId: String) -> StoryPublishQueueItem {
        StoryPublishQueueItem(visibility: "PUBLIC", slidesPayload: Data("[]".utf8), mediaReferences: [], tempStoryId: tempStoryId)
    }
}
