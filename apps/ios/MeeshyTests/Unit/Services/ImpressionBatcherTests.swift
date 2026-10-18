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

        XCTAssertEqual(service.recordedSocialEventBatches, [[
            .impression(postId: "p1", source: "feed", surface: nil),
            .impression(postId: "p2", source: "feed", surface: nil),
        ]], "Sans surface déclarée, le lot part quand même par la porte unique, clé surface absente.")
        XCTAssertEqual(service.recordedSocialEventsCredentials, [.account])
    }

    /// Une impression par apparition : les répétitions doivent survivre au lot.
    func test_record_keepsRepeatedOccurrences() async {
        let (sut, service) = makeSUT()

        sut.record("p1")
        sut.record("p1")
        sut.record("p1")
        try? await Task.sleep(nanoseconds: 200_000_000)

        XCTAssertEqual(service.lastSocialEventPostIds, ["p1", "p1", "p1"])
    }

    // MARK: - Sortie d'écran / arrière-plan

    func test_flushNow_sendsImmediatelyWithoutWaitingForTheDelay() async {
        let (sut, service) = makeSUT(flushDelay: 60)

        sut.record("p1")
        await sut.flushNow()

        XCTAssertEqual(service.recordSocialEventsCallCount, 1)
        XCTAssertEqual(service.lastSocialEventPostIds, ["p1"])
    }

    func test_flushNow_withNothingPending_doesNotCallTheService() async {
        let (sut, service) = makeSUT(flushDelay: 60)

        await sut.flushNow()

        XCTAssertEqual(service.recordSocialEventsCallCount, 0)
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

        XCTAssertEqual(service.lastSocialEventPostIds, ["p1", "p1", "p2"])
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

        XCTAssertEqual(service.lastSocialEventPostIds, ["p1"])
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

        XCTAssertEqual(service.recordSocialEventsCallCount, 0,
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

        XCTAssertEqual(profileService.lastSocialEventPostIds, ["p2"])
        XCTAssertEqual(profileService.recordedImpressionSources.last, "profile")
    }

    // MARK: - Échec réseau

    func test_failedFlush_keepsOccurrencesForTheNextAttempt() async {
        let (sut, service) = makeSUT(flushDelay: 60)
        service.recordSocialEventsResult = .failure(NSError(domain: "net", code: -1009))
        sut.record("p1")

        await sut.flushNow()
        XCTAssertEqual(service.recordSocialEventsCallCount, 1)

        service.recordSocialEventsResult = .success(SocialEventsReceipt(recorded: 1, rejected: 0))
        await sut.flushNow()

        XCTAssertEqual(service.recordSocialEventsCallCount, 2)
        XCTAssertEqual(service.lastSocialEventPostIds, ["p1"],
                       "l'occurrence perdue par le réseau doit repartir, pas disparaître")
    }
}

/// Une file d'impressions sans plafond grossissait sans fin pendant une longue
/// panne (hors ligne, 5xx, 429, session expirée) : chaque carte apparue
/// réencodait tout le tableau dans `UserDefaults`, sur le fil principal.
extension ImpressionBatcherTests {

    func test_failedFlushes_keepAtMostTheCap_newestFirstKept() async {
        let service = MockPostService()
        service.recordSocialEventsResult = .failure(NSError(domain: "net", code: -1009))
        let sut = ImpressionBatcher(
            source: "feed", postService: service, flushDelay: 60,
            defaults: defaults, accountId: { "acc-cap" }
        )
        let total = ImpressionBatcher.pendingCap + 40
        for i in 0..<total { sut.record("p\(i)") }
        await sut.flushNow()
        for i in total..<(total + 10) { sut.record("p\(i)") }

        let key = ImpressionBatcher.storageKey(source: "feed", surface: nil, accountId: "acc-cap")
        let kept = ImpressionBatcher.restore(from: defaults, key: key)
        XCTAssertEqual(kept.count, ImpressionBatcher.pendingCap)
        XCTAssertEqual(kept.last?.postId, "p\(total + 9)", "la plus récente est gardée")
        XCTAssertFalse(kept.contains { $0.postId == "p0" }, "la plus ancienne est abandonnée")
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

/// #10398 — un paquet refusé pour de bon (4xx hors 408/429, ou réponse 2xx
/// illisible) était réinséré, renvoyé, refusé encore : la surface ne
/// comptait plus jamais rien. Le refus permanent se jette ; la panne se garde.
extension ImpressionBatcherTests {

    func test_aChunkRejectedWith400_isDroppedInsteadOfBlockingTheSurface() async {
        let (sut, service) = makeSUT(flushDelay: 60)
        service.recordSocialEventsResult = .failure(APIError.serverError(400, "body/events must NOT have more than 200 items"))
        sut.record("p1")

        await sut.flushNow()
        service.recordSocialEventsResult = .success(SocialEventsReceipt(recorded: 1, rejected: 0))
        await sut.flushNow()

        XCTAssertEqual(service.recordSocialEventsCallCount, 1,
                       "un refus permanent ne se rejoue pas — sinon la file ne se vide jamais")
    }

    func test_aRejectedChunk_doesNotTakeTheNextChunkWithIt() async {
        let (sut, service) = makeSUT(flushDelay: 60)
        service.recordSocialEventsResultsQueue = [
            .failure(APIError.serverError(400, nil)),
            .success(SocialEventsReceipt(recorded: 50, rejected: 0)),
        ]
        (0..<250).forEach { sut.record("p\($0)") }

        await sut.flushNow()

        XCTAssertEqual(service.recordedSocialEventBatches.map(\.count), [200, 50],
                       "le paquet suivant part quand même")
    }

    func test_aChunkRejectedWith429_isKeptForTheNextAttempt() async {
        let (sut, service) = makeSUT(flushDelay: 60)
        service.recordSocialEventsResult = .failure(APIError.serverError(429, nil))
        sut.record("p1")

        await sut.flushNow()
        service.recordSocialEventsResult = .success(SocialEventsReceipt(recorded: 1, rejected: 0))
        await sut.flushNow()

        XCTAssertEqual(service.recordedSocialEventBatches.map { $0.map(\.postId) }, [["p1"], ["p1"]])
    }
}

/// #10500 — un lot rejoué après une panne n'est compté qu'une fois, et daté de
/// l'APPARITION. Avant, la file ne gardait que des identifiants : chaque
/// tentative fabriquait de nouveaux événements, que la passerelle recomptait,
/// datés de l'envoi.
extension ImpressionBatcherTests {

    private func stamps(_ service: MockPostService) -> [[SocialEventStamp]] {
        service.recordedStampedSocialEventBatches.map { $0.map(\.stamp) }
    }

    func test_retryAfterAFailure_sendsExactlyTheSameEventIds() async throws {
        let (sut, service) = makeSUT(flushDelay: 60)
        service.recordSocialEventsResultsQueue = [
            .failure(NSError(domain: "net", code: -1009)),
            .failure(NSError(domain: "net", code: -1009)),
        ]
        sut.record("p1")
        sut.record("p2")

        await sut.flushNow()
        await sut.flushNow()
        await sut.flushNow()

        let attempts = stamps(service).map { $0.map(\.eventId) }
        XCTAssertEqual(attempts.count, 3)
        XCTAssertEqual(Set(attempts[0]).count, 2, "Deux apparitions, deux identifiants.")
        XCTAssertEqual(attempts[1], attempts[0], "La tentative 2 renvoie les mêmes eventId.")
        XCTAssertEqual(attempts[2], attempts[0], "La tentative 3 aussi.")
    }

    func test_retryAcrossALaunch_sendsTheSameEventIds() async throws {
        let failing = MockPostService()
        failing.recordSocialEventsResult = .failure(NSError(domain: "net", code: -1009))
        let first = ImpressionBatcher(source: "feed", postService: failing, flushDelay: 60, defaults: defaults, accountId: { nil })
        first.record("p1")
        await first.flushNow()

        let online = MockPostService()
        let revived = ImpressionBatcher(source: "feed", postService: online, flushDelay: 60, defaults: defaults, accountId: { nil })
        await revived.flushNow()

        XCTAssertEqual(stamps(online).flatMap { $0 }.map(\.eventId), stamps(failing).flatMap { $0 }.map(\.eventId))
    }

    func test_occurredAt_isTheAppearanceTime_notTheSendTime() async throws {
        let service = MockPostService()
        let clock = ClockBox(now: Date(timeIntervalSince1970: 1_700_000_000))
        let sut = ImpressionBatcher(
            source: "feed", postService: service, flushDelay: 60, defaults: defaults,
            accountId: { nil }, clock: { clock.now }
        )
        sut.record("p1")
        clock.now = Date(timeIntervalSince1970: 1_700_000_900)

        await sut.flushNow()

        XCTAssertEqual(stamps(service).first?.first?.occurredAt, Date(timeIntervalSince1970: 1_700_000_000))
    }

    /// L'ancien format (`[String]`) est relu sans perte, puis réécrit : deux
    /// relectures successives voient les MÊMES identifiants.
    func test_legacyIdsQueue_isReadWithoutLoss_andRewrittenInTheNewFormat() async throws {
        let key = ImpressionBatcher.storageKey(source: "feed", surface: nil)
        defaults.set(["p1", "p2", "p1"], forKey: key)

        let migrated = ImpressionBatcher.restore(from: defaults, key: key)
        let reread = ImpressionBatcher.restore(from: defaults, key: key)

        XCTAssertEqual(migrated.map(\.postId), ["p1", "p2", "p1"])
        XCTAssertTrue(migrated.allSatisfy { $0.stamp.occurredAt == nil }, "L'heure est inconnue : la passerelle date à réception.")
        XCTAssertNil(defaults.stringArray(forKey: key), "L'ancien format est réécrit aussitôt.")
        XCTAssertNotNil(defaults.data(forKey: key))
        XCTAssertEqual(reread.map(\.stamp.eventId), migrated.map(\.stamp.eventId))
    }

    func test_legacyIdsQueue_isReplayedWithTheRewrittenEventIds() async throws {
        let key = ImpressionBatcher.storageKey(source: "feed", surface: nil)
        defaults.set(["p1"], forKey: key)
        let failing = MockPostService()
        failing.recordSocialEventsResult = .failure(NSError(domain: "net", code: -1009))
        let first = ImpressionBatcher(source: "feed", postService: failing, flushDelay: 60, defaults: defaults, accountId: { nil })
        await first.flushNow()

        let online = MockPostService()
        let revived = ImpressionBatcher(source: "feed", postService: online, flushDelay: 60, defaults: defaults, accountId: { nil })
        await revived.flushNow()

        XCTAssertEqual(online.recordedImpressionPostIds, ["p1"])
        XCTAssertEqual(stamps(online).flatMap { $0 }.map(\.eventId), stamps(failing).flatMap { $0 }.map(\.eventId))
    }
}

@MainActor
private final class ClockBox {
    nonisolated deinit {}
    var now: Date
    init(now: Date) { self.now = now }
}
