import XCTest
@testable import Meeshy
import MeeshySDK

/// Les impressions étaient groupées sur 3 s dans un `Task` local à chaque vue.
/// Trois façons d'en perdre un lot entier : quitter l'écran (`FeedView`
/// ANNULAIT explicitement le task en `onDisappear`), passer l'app en
/// arrière-plan, ou la fermer. Avec la déduplication de session, la perte se
/// rattrapait à la prochaine apparition ; depuis qu'on compte une impression
/// par apparition, une occurrence perdue l'est définitivement.
@MainActor
final class ImpressionBatcherTests: XCTestCase {

    private var defaults: UserDefaults!
    private var suiteName: String!

    override func setUp() async throws {
        try await super.setUp()
        suiteName = "impression-batcher-tests-\(UUID().uuidString)"
        defaults = UserDefaults(suiteName: suiteName)
    }

    override func tearDown() async throws {
        defaults.removePersistentDomain(forName: suiteName)
        defaults = nil
        try await super.tearDown()
    }

    private func makeSUT(
        source: String = "feed",
        flushDelay: TimeInterval = 0.05
    ) -> (sut: ImpressionBatcher, service: MockPostService) {
        let service = MockPostService()
        let sut = ImpressionBatcher(
            source: source,
            postService: service,
            flushDelay: flushDelay,
            defaults: defaults
        )
        return (sut, service)
    }

    // MARK: - Groupement

    func test_record_batchesOccurrencesAfterTheDelay() async {
        let (sut, service) = makeSUT()

        sut.record("p1")
        sut.record("p2")
        try? await Task.sleep(nanoseconds: 200_000_000)

        XCTAssertEqual(service.recordImpressionsCallCount, 1)
        XCTAssertEqual(service.lastRecordImpressionPostIds, ["p1", "p2"])
        XCTAssertEqual(service.lastRecordImpressionsSource, "feed")
    }

    /// Une impression par apparition : les répétitions doivent survivre au lot.
    func test_record_keepsRepeatedOccurrences() async {
        let (sut, service) = makeSUT()

        sut.record("p1")
        sut.record("p1")
        sut.record("p1")
        try? await Task.sleep(nanoseconds: 200_000_000)

        XCTAssertEqual(service.lastRecordImpressionPostIds, ["p1", "p1", "p1"])
    }

    // MARK: - Sortie d'écran / arrière-plan

    func test_flushNow_sendsImmediatelyWithoutWaitingForTheDelay() async {
        let (sut, service) = makeSUT(flushDelay: 60)

        sut.record("p1")
        await sut.flushNow()

        XCTAssertEqual(service.recordImpressionsCallCount, 1)
        XCTAssertEqual(service.lastRecordImpressionPostIds, ["p1"])
    }

    func test_flushNow_withNothingPending_doesNotCallTheService() async {
        let (sut, service) = makeSUT(flushDelay: 60)

        await sut.flushNow()

        XCTAssertEqual(service.recordImpressionsCallCount, 0)
    }

    // MARK: - Survie à la fermeture de l'app

    /// Le seul cas que ni la sortie d'écran ni l'arrière-plan ne couvrent :
    /// l'app est tuée dans la fenêtre de groupement. Les occurrences en attente
    /// sont persistées à chaque `record`, donc rejouables au lancement suivant.
    func test_pendingOccurrences_survivePersistenceAcrossInstances() async {
        let (sut, _) = makeSUT(flushDelay: 60)
        sut.record("p1")
        sut.record("p1")
        sut.record("p2")

        // Nouvelle instance sur le même stockage = relance d'app.
        let service = MockPostService()
        let revived = ImpressionBatcher(
            source: "feed", postService: service, flushDelay: 0.05, defaults: defaults
        )
        await revived.flushNow()

        XCTAssertEqual(service.lastRecordImpressionPostIds, ["p1", "p1", "p2"])
    }

    /// Le rejeu ne doit pas dépendre d'une nouvelle apparition : une surface qui
    /// n'affiche plus rien laisserait le lot en attente indéfiniment.
    func test_pendingOccurrences_areReplayedWithoutWaitingForANewAppearance() async {
        let (sut, _) = makeSUT(flushDelay: 60)
        sut.record("p1")

        let service = MockPostService()
        // Retenu : le flush différé capture `[weak self]`, donc une instance
        // non retenue serait libérée avant d'avoir émis (en production, la vue
        // la tient via `@StateObject`).
        let revived = ImpressionBatcher(
            source: "feed", postService: service, flushDelay: 0.05, defaults: defaults
        )
        try? await Task.sleep(nanoseconds: 300_000_000)

        XCTAssertEqual(service.lastRecordImpressionPostIds, ["p1"])
        withExtendedLifetime(revived) {}
    }

    func test_afterASuccessfulFlush_nothingIsReplayedOnTheNextLaunch() async {
        let (sut, _) = makeSUT(flushDelay: 0.05)
        sut.record("p1")
        try? await Task.sleep(nanoseconds: 200_000_000)

        let service = MockPostService()
        let revived = ImpressionBatcher(
            source: "feed", postService: service, flushDelay: 0.05, defaults: defaults
        )
        await revived.flushNow()

        XCTAssertEqual(service.recordImpressionsCallCount, 0,
                       "un lot déjà envoyé ne doit pas être recompté au lancement suivant")
    }

    /// Deux surfaces ont des `source` différents : leurs files ne doivent pas
    /// se mélanger, sinon une impression de profil serait comptée comme feed.
    func test_sourcesKeepSeparateQueues() async {
        let (feed, _) = makeSUT(source: "feed", flushDelay: 60)
        let (profile, profileService) = makeSUT(source: "profile", flushDelay: 60)

        feed.record("p1")
        profile.record("p2")
        await profile.flushNow()

        XCTAssertEqual(profileService.lastRecordImpressionPostIds, ["p2"])
        XCTAssertEqual(profileService.lastRecordImpressionsSource, "profile")
    }

    // MARK: - Échec réseau

    func test_failedFlush_keepsOccurrencesForTheNextAttempt() async {
        let (sut, service) = makeSUT(flushDelay: 60)
        service.recordImpressionsResult = .failure(NSError(domain: "net", code: -1009))
        sut.record("p1")

        await sut.flushNow()
        XCTAssertEqual(service.recordImpressionsCallCount, 1)

        service.recordImpressionsResult = .success(())
        await sut.flushNow()

        XCTAssertEqual(service.recordImpressionsCallCount, 2)
        XCTAssertEqual(service.lastRecordImpressionPostIds, ["p1"],
                       "l'occurrence perdue par le réseau doit repartir, pas disparaître")
    }
}

/// outbox-11 — purge de logout des lots d'impressions persistés.
extension ImpressionBatcherTests {

    func test_purgeAllPendingImpressions_removesOnlyPrefixedKeys() {
        defaults.set(["p1"], forKey: "meeshy.impressions.pending.feed")
        defaults.set(["p2"], forKey: "meeshy.impressions.pending.profile")
        defaults.set("garder", forKey: "meeshy.unrelated.key")

        ImpressionBatcher.purgeAllPendingImpressions(in: defaults)

        XCTAssertNil(defaults.object(forKey: "meeshy.impressions.pending.feed"))
        XCTAssertNil(defaults.object(forKey: "meeshy.impressions.pending.profile"))
        XCTAssertEqual(defaults.string(forKey: "meeshy.unrelated.key"), "garder",
                       "seules les clés préfixées impressions sont purgées")
    }
}
