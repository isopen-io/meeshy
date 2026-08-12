import XCTest
@testable import MeeshySDK

/// S3.4 + S3.5 — revendication ATOMIQUE d'un item et robustesse du balayage.
///
/// Deux producteurs peuvent vouloir publier le même item persisté : le chemin
/// online du ViewModel (write-ahead) et le drain de fond (`processNext`). La
/// seule barrière contre la double publication est le retour de `markInFlight`,
/// que les DEUX doivent lire. Et un item fautif ne doit plus geler les suivants
/// — sans pour autant laisser une panne réseau brûler le budget de toute la file.
///
/// Le handler est TOUJOURS posé AVANT le premier `enqueue` : `setPublishHandler`
/// auto-draine une file non vide (M5), et cette passe fantôme fausserait à la
/// fois les compteurs de ce test et l'état laissé aux suites suivantes.
final class StoryPublishQueueSweepTests: XCTestCase {

    private var queue: StoryPublishQueue!

    override func setUp() async throws {
        try await super.setUp()
        queue = StoryPublishQueue.shared
        await queue._testResetPublishHandler()
        await queue.clearAll()
    }

    override func tearDown() async throws {
        await queue._testResetPublishHandler()
        await queue.clearAll()
        try await super.tearDown()
    }

    // MARK: - Revendication atomique

    func test_markInFlight_firstCall_returnsTrue() async {
        let claimed = await queue.markInFlight("item-a")
        XCTAssertTrue(claimed, "Une revendication libre doit être accordée")
    }

    func test_markInFlight_secondCallWithoutRelease_returnsFalse() async {
        _ = await queue.markInFlight("item-a")
        let second = await queue.markInFlight("item-a")
        XCTAssertFalse(second, "Un item déjà revendiqué ne peut pas l'être une seconde fois")
    }

    func test_processNext_marksItemInFlightWhileItsHandlerRuns() async {
        let observed = Flag()
        await queue.setPublishHandler { [queue] published in
            // Réentrance sur l'acteur : le handler interroge la queue PENDANT
            // que le balayage la détient.
            let inFlight = await queue!.isInFlight(published.id)
            await observed.set(inFlight)
            return "server-ok"
        }
        await queue.enqueue(makeItem())
        await queue.processNext()

        let value = await observed.value
        XCTAssertTrue(value, "Le drain doit revendiquer l'item pendant qu'il le publie")
    }

    func test_processNext_retryableFailure_releasesInFlight() async {
        await queue.setPublishHandler { _ in throw URLError(.notConnectedToInternet) }
        let item = makeItem()
        await queue.enqueue(item)

        await queue.processNext()

        let stillClaimed = await queue.isInFlight(item.id)
        XCTAssertFalse(stillClaimed, "Un échec retryable relâche la revendication")
        let pending = await queue.pendingItems
        XCTAssertEqual(pending.count, 1, "L'item reste en attente d'une prochaine passe")
    }

    func test_processNext_success_releasesInFlight() async {
        await queue.setPublishHandler { _ in "server-ok" }
        let item = makeItem()
        await queue.enqueue(item)

        await queue.processNext()

        let stillClaimed = await queue.isInFlight(item.id)
        XCTAssertFalse(stillClaimed, "Aucun marqueur résiduel après un succès")
    }

    func test_processNext_itemClaimedByAnotherProducer_isSkippedWithoutBumpingRetryCount() async {
        let attempts = Counter()
        await queue.setPublishHandler { _ in
            await attempts.increment()
            return "server-ok"
        }
        let item = makeItem()
        await queue.enqueue(item)
        _ = await queue.markInFlight(item.id)

        await queue.processNext()

        let count = await attempts.value
        XCTAssertEqual(count, 0, "Un item revendiqué ailleurs n'est pas publié une seconde fois")
        let pending = await queue.pendingItems
        XCTAssertEqual(pending.first?.retryCount, 0, "Un skip ne consomme aucun budget de retry")
    }

    // MARK: - Balayage : `continue` borné

    func test_processNext_firstItemFailsRetryably_secondItemIsStillAttempted() async {
        let a = makeItem()
        let b = makeItem()
        let published = PublishedLog()
        await queue.setPublishHandler { item in
            if item.id == a.id { throw URLError(.timedOut) }
            await published.append(item.id)
            return "server-ok"
        }
        await queue.enqueue(a)
        await queue.enqueue(b)

        await queue.processNext()

        let ids = await published.ids
        XCTAssertEqual(ids, [b.id], "Un item fautif ne gèle plus le balayage")
        let pending = await queue.pendingItems
        XCTAssertEqual(pending.count, 1)
        XCTAssertEqual(pending.first?.retryCount, 1)
    }

    func test_processNext_twoConsecutiveRetryableFailures_abortsRemainingSweep() async {
        let attempts = Counter()
        await queue.setPublishHandler { _ in
            await attempts.increment()
            throw URLError(.notConnectedToInternet)
        }
        for _ in 0..<3 { await queue.enqueue(makeItem()) }

        await queue.processNext()

        let count = await attempts.value
        XCTAssertEqual(count, 2, "Deux échecs consécutifs = le réseau est tombé, on arrête la passe")
    }

    func test_processNext_failureThenSuccessThenFailure_resetsConsecutiveCounter() async {
        let a = makeItem(), b = makeItem(), c = makeItem(), d = makeItem()
        let attempts = Counter()
        await queue.setPublishHandler { item in
            await attempts.increment()
            if item.id == a.id || item.id == c.id { throw URLError(.timedOut) }
            return "server-ok"
        }
        for item in [a, b, c, d] { await queue.enqueue(item) }

        await queue.processNext()

        let count = await attempts.value
        XCTAssertEqual(count, 4, "Un succès entre deux échecs remet le compteur à zéro")
    }

    func test_processNext_retryBudgetIsOnlyChargedToTheFailingItem() async {
        let a = makeItem()
        let b = makeItem()
        await queue.setPublishHandler { item in
            if item.id == a.id { throw URLError(.timedOut) }
            throw StoryPublishUnrecoverableError("keep b out of the pending queue")
        }
        await queue.enqueue(a)
        await queue.enqueue(b)

        await queue.processNext()

        let pending = await queue.pendingItems
        XCTAssertEqual(pending.first?.id, a.id)
        XCTAssertEqual(pending.first?.retryCount, 1, "Seul l'item fautif consomme son budget")
        let failed = await queue.failedPendingItems
        XCTAssertEqual(failed.first?.retryCount, 0, "Le budget de B reste intact")
    }

    func test_processNext_queueLongerThanSweepCap_processesTheRemainderInAFollowUpPass() async {
        let attempts = Counter()
        await queue.setPublishHandler { _ in
            await attempts.increment()
            return "server-ok"
        }
        for _ in 0..<12 { await queue.enqueue(makeItem()) }

        await queue.processNext()

        // La passe s'arrête au cap puis se relance : la file finit vidée sans
        // qu'un `enqueue` concurrent ait à attendre le prochain déclencheur.
        let deadline = Date().addingTimeInterval(20)
        while await queue.count > 0, Date() < deadline {
            try? await Task.sleep(nanoseconds: 100_000_000)
        }
        let remaining = await queue.count
        XCTAssertEqual(remaining, 0, "La passe de suivi draine le reliquat")
        let count = await attempts.value
        XCTAssertEqual(count, 12)
    }

    func test_processNext_itemsClaimedElsewhere_doNotConsumeTheSweepBudget() async {
        let published = PublishedLog()
        await queue.setPublishHandler { item in
            await published.append(item.id)
            return "server-ok"
        }
        // Dix items déjà revendiqués par l'autre producteur, puis un item LIBRE.
        // Si le cap de passe se comptait sur la POSITION, les dix sauts
        // brûleraient tout le budget et l'item libre ne serait jamais publié.
        var claimed: [String] = []
        for _ in 0..<10 {
            let item = makeItem()
            claimed.append(item.id)
            await queue.enqueue(item)
        }
        let free = makeItem()
        await queue.enqueue(free)
        for id in claimed { _ = await queue.markInFlight(id) }

        await queue.processNext()

        let ids = await published.ids
        XCTAssertEqual(ids, [free.id], "Le cap de passe compte les items TENTÉS, pas les sauts")
    }

    func test_processNext_allItemsClaimedElsewhere_doesNotRescheduleItself() async {
        let attempts = Counter()
        await queue.setPublishHandler { _ in
            await attempts.increment()
            return "server-ok"
        }
        var ids: [String] = []
        for _ in 0..<11 {
            let item = makeItem()
            ids.append(item.id)
            await queue.enqueue(item)
        }
        for id in ids { _ = await queue.markInFlight(id) }

        await queue.processNext()

        // Les revendications tombent. SEUL un déclencheur explicite doit
        // relancer une passe : une passe qui se re-programme sans avoir rien
        // tenté tourne en boucle sur l'acteur et publierait ici toute seule.
        for id in ids { await queue.clearInFlight(id) }
        try? await Task.sleep(nanoseconds: 500_000_000)

        let count = await attempts.value
        XCTAssertEqual(count, 0, "Une passe qui n'a rien tenté ne se re-programme pas")
    }

    // MARK: - Helpers

    private func makeItem() -> StoryPublishQueueItem {
        StoryPublishQueueItem(visibility: "PUBLIC", slidesPayload: Data("[]".utf8))
    }
}

// MARK: - Accumulateurs Sendable

private actor Counter {
    private(set) var value = 0
    func increment() { value += 1 }
}

private actor Flag {
    private(set) var value = false
    func set(_ newValue: Bool) { value = newValue }
}

private actor PublishedLog {
    private(set) var ids: [String] = []
    func append(_ id: String) { ids.append(id) }
}
