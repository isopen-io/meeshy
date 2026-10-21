import XCTest
import Combine
@testable import Meeshy
import MeeshySDK

/// #10483 — l'écran visiteur était le trou central du comptage : un contenu
/// ouvert sans compte ne laissait aucune trace. Il compte désormais une
/// impression et une vue au service, et la durée de lecture à la sortie.
@MainActor
final class VisitorContentReachTests: XCTestCase {

    private var defaults: UserDefaults!
    private var suiteName: String!

    override func setUp() async throws {
        try await super.setUp()
        suiteName = "visitor-reach-tests-\(UUID().uuidString)"
        defaults = UserDefaults(suiteName: suiteName)
    }

    override func tearDown() async throws {
        defaults.removePersistentDomain(forName: suiteName)
        defaults = nil
        try await super.tearDown()
    }

    private func served(_ postId: String) -> VisitorContentState {
        .served(post: FeedPost(id: postId, author: "Ada", content: "Bonjour"), sharer: nil)
    }

    // MARK: - L'écran

    func test_load_publicPost_sendsImpressionAndView() {
        let reporter = MockVisitorReachReporter()
        let sut = VisitorContentReach(reporter: reporter, entries: DetailOpenSources())

        sut.stateChanged(.pending)
        sut.stateChanged(served("p1"))

        XCTAssertEqual(reporter.recorded, [
            .impression(postId: "p1", source: "detail", surface: .visitor),
            .view(postId: "p1", durationMs: nil, surface: .visitor, entry: .direct),
        ], "Sans référent, la vue est `direct`.")
    }

    /// Un `/l/<jeton>` résolu par le routeur des liens : la vue d'ouverture ET
    /// celle de sortie portent `tracking_link`, l'impression garde `shared_link`.
    func test_load_fromATrackingLink_bothViewsCarryTrackingLink() async {
        let reporter = MockVisitorReachReporter()
        let entries = DetailOpenSources()
        entries.mark("p1", entry: .trackingLink)
        var now = Date(timeIntervalSince1970: 1_000)
        let sut = VisitorContentReach(reporter: reporter, entries: entries, clock: { now })

        sut.stateChanged(served("p1"))
        now = now.addingTimeInterval(2)
        await sut.left()

        XCTAssertEqual(reporter.recorded, [
            .impression(postId: "p1", source: "shared_link", surface: .visitor),
            .view(postId: "p1", durationMs: nil, surface: .visitor, entry: .trackingLink),
            .view(postId: "p1", durationMs: 2_000, surface: .visitor, entry: .trackingLink),
        ])
    }

    func test_load_fromAViaLink_viewCarriesSharedLink() {
        let reporter = MockVisitorReachReporter()
        let entries = DetailOpenSources()
        entries.mark("p1", entry: .sharedLink)
        let sut = VisitorContentReach(reporter: reporter, entries: entries)

        sut.stateChanged(served("p1"))

        XCTAssertEqual(reporter.recorded.last, .view(postId: "p1", durationMs: nil, surface: .visitor, entry: .sharedLink))
    }

    func test_load_refusedOrFailed_sendsNothing() {
        let reporter = MockVisitorReachReporter()
        let sut = VisitorContentReach(reporter: reporter, entries: DetailOpenSources())

        sut.stateChanged(.refused)
        sut.stateChanged(.failed)

        XCTAssertTrue(reporter.recorded.isEmpty)
    }

    func test_load_sameContentServedTwice_countsOnce() {
        let reporter = MockVisitorReachReporter()
        let sut = VisitorContentReach(reporter: reporter, entries: DetailOpenSources())

        sut.stateChanged(served("p1"))
        sut.stateChanged(.pending)
        sut.stateChanged(served("p1"))

        XCTAssertEqual(reporter.recorded.count, 2)
    }

    func test_disappear_sendsViewWithDuration() async {
        let reporter = MockVisitorReachReporter()
        var now = Date(timeIntervalSince1970: 1_000)
        let sut = VisitorContentReach(reporter: reporter, entries: DetailOpenSources(), clock: { now })
        sut.stateChanged(served("p1"))

        now = now.addingTimeInterval(4.2)
        await sut.left()

        XCTAssertEqual(reporter.recorded.last, .view(postId: "p1", durationMs: 4_200, surface: .visitor, entry: .direct))
        XCTAssertEqual(reporter.flushCount, 1)
    }

    func test_disappear_withoutServedContent_sendsNothing() async {
        let reporter = MockVisitorReachReporter()
        let sut = VisitorContentReach(reporter: reporter, entries: DetailOpenSources())

        await sut.left()

        XCTAssertTrue(reporter.recorded.isEmpty)
        XCTAssertEqual(reporter.flushCount, 0)
    }

    // MARK: - L'envoi

    private func makeReporter(
        service: MockPostService,
        reconnects: AnyPublisher<Void, Never> = Empty().eraseToAnyPublisher()
    ) -> VisitorReachReporter {
        VisitorReachReporter(
            postService: service,
            defaults: defaults,
            token: { "visitor_test" },
            knownTokens: { ["visitor_test"] },
            flushDelay: 60,
            reconnects: reconnects
        )
    }

    /// Même défaut que la file des impressions : sans plafond, une longue
    /// panne la faisait grossir sans fin, chaque événement réécrivant tout le
    /// tableau dans `UserDefaults`.
    func test_failedFlushes_keepAtMostTheCap() async {
        let service = MockPostService()
        service.recordSocialEventsResult = .failure(NSError(domain: "net", code: -1009))
        let sut = makeReporter(service: service)
        let total = VisitorReachReporter.pendingCap + 30
        sut.record((0..<total).map { .impression(postId: "p\($0)", source: "detail", surface: .visitor) })
        await sut.flushNow()
        sut.record([.impression(postId: "last", source: "detail", surface: .visitor)])

        XCTAssertEqual(sut.pendingEvents.count, VisitorReachReporter.pendingCap)
    }

    func test_flush_sendsViewsAndImpressionsInTwoRequests_underTheVisitorToken() async {
        let service = MockPostService()
        let sut = makeReporter(service: service)

        sut.record([
            .impression(postId: "p1", source: "detail", surface: .visitor),
            .view(postId: "p1", durationMs: nil, surface: .visitor),
        ])
        await sut.flushNow()

        XCTAssertEqual(service.recordedSocialEventBatches, [
            [.view(postId: "p1", durationMs: nil, surface: .visitor)],
            [.impression(postId: "p1", source: "detail", surface: .visitor)],
        ])
        XCTAssertEqual(service.recordedSocialEventsCredentials, [.visitor("visitor_test"), .visitor("visitor_test")])
        XCTAssertTrue(sut.pendingEvents.isEmpty)
    }

    /// Un serveur antérieur à #10483 refuse l'impression d'un anonyme (403) :
    /// elle sort de la file sans être rejouée, et la vue, elle, est comptée.
    func test_forbidden_dropsWithoutRetry() async {
        let service = MockPostService()
        service.recordSocialEventsResultsQueue = [
            .success(SocialEventsReceipt(recorded: 1, rejected: 0)),
            .failure(MeeshyError.forbidden(reason: "Forbidden", body: nil)),
        ]
        let sut = makeReporter(service: service)
        sut.record([
            .impression(postId: "p1", source: "detail", surface: .visitor),
            .view(postId: "p1", durationMs: nil, surface: .visitor),
        ])

        await sut.flushNow()
        await sut.flushNow()

        XCTAssertEqual(service.recordSocialEventsCallCount, 2, "Le 403 ne se rejoue pas.")
        XCTAssertTrue(sut.pendingEvents.isEmpty)
        XCTAssertNil(defaults.data(forKey: VisitorReachReporter.storageKey))
    }

    /// L'engagement d'ouverture d'un visiteur part dans SA requête : un serveur
    /// qui ne connaît pas `open` (400) le retire sans rejeu, la vue est comptée.
    func test_open_travelsAlone_andItsRefusalKeepsTheView() async {
        let service = MockPostService()
        service.recordSocialEventsResultsQueue = [
            .success(SocialEventsReceipt(recorded: 1, rejected: 0)),
            .failure(MeeshyError.server(statusCode: 400, message: "invalid")),
        ]
        let sut = makeReporter(service: service)
        sut.record([
            .open(postId: "p1", origin: .feed),
            .view(postId: "p1", durationMs: nil, surface: .visitor, entry: .listing(.feed)),
        ])

        await sut.flushNow()
        await sut.flushNow()

        XCTAssertEqual(service.recordedSocialEventBatches, [
            [.view(postId: "p1", durationMs: nil, surface: .visitor, entry: .listing(.feed))],
            [.open(postId: "p1", origin: .feed)],
        ])
        XCTAssertTrue(sut.pendingEvents.isEmpty, "Le 400 des `open` ne se rejoue pas.")
    }

    func test_offline_persistsAndFlushesOnReconnect() async {
        let offline = MockPostService()
        offline.recordSocialEventsResult = .failure(URLError(.notConnectedToInternet))
        let first = makeReporter(service: offline)
        first.record([.view(postId: "p1", durationMs: 1_500, surface: .visitor)])
        await first.flushNow()
        XCTAssertEqual(first.pendingEvents.count, 1, "Hors ligne, la vue reste en file.")

        let reconnects = PassthroughSubject<Void, Never>()
        let online = MockPostService()
        let revived = makeReporter(service: online, reconnects: reconnects.eraseToAnyPublisher())
        XCTAssertEqual(revived.pendingEvents.count, 1, "La file persiste d'un lancement à l'autre.")

        reconnects.send(())
        let flushed = await waitUntil { online.recordSocialEventsCallCount == 1 }

        XCTAssertTrue(flushed)
        XCTAssertEqual(online.recordedSocialEvents, [.view(postId: "p1", durationMs: 1_500, surface: .visitor)])
        XCTAssertEqual(online.recordedSocialEventsCredentials, [.visitor("visitor_test")])
        XCTAssertTrue(revived.pendingEvents.isEmpty)
    }

    func test_identity_isFrozenWhenTheContentWasSeen() async {
        let service = MockPostService()
        let identity = IdentityBox(value: "visitor_a")
        let sut = VisitorReachReporter(
            postService: service, defaults: defaults, token: { identity.value },
            knownTokens: { ["anon_guest", "visitor_a"] }, flushDelay: 60,
            reconnects: Empty().eraseToAnyPublisher()
        )
        sut.record([.view(postId: "p1", durationMs: nil, surface: .visitor)])
        identity.value = "anon_guest"
        sut.record([.view(postId: "p2", durationMs: nil, surface: .visitor)])

        await sut.flushNow()

        XCTAssertEqual(service.recordedSocialEventsCredentials, [.visitor("visitor_a"), .visitor("anon_guest")])
    }

    // MARK: - Le jeton ne touche jamais le disque

    /// Le jeton d'un invité de lien est un credential : la file persistée
    /// (`UserDefaults`, en clair, sauvegardée) n'en garde qu'une empreinte.
    func test_persistedQueue_neverContainsTheToken() throws {
        let secret = "anon_8f3c2a91d7e64b0f9a1c5e7d3b2a6f4e"
        let sut = VisitorReachReporter(
            postService: MockPostService(), defaults: defaults, token: { secret },
            knownTokens: { [secret] }, flushDelay: 60,
            reconnects: Empty().eraseToAnyPublisher()
        )

        sut.record([
            .impression(postId: "p1", source: "detail", surface: .visitor),
            .view(postId: "p1", durationMs: nil, surface: .visitor),
        ])

        let domain = try XCTUnwrap(defaults.persistentDomain(forName: suiteName))
        XCTAssertFalse(domain.isEmpty, "La file doit bien être persistée.")
        let written = try PropertyListSerialization.data(fromPropertyList: domain, format: .xml, options: 0)
        let decodedPayloads = domain.values.compactMap { $0 as? Data }.compactMap { String(data: $0, encoding: .utf8) }
        let everything = (String(data: written, encoding: .utf8) ?? "") + decodedPayloads.joined()
        XCTAssertFalse(everything.contains(secret), "Le jeton a été écrit en clair dans UserDefaults.")
        XCTAssertFalse(everything.contains("8f3c2a91d7e64b0f"), "Une partie du jeton a été écrite dans UserDefaults.")
    }

    /// Le jeton est relu au moment d'envoyer : c'est bien lui qui part.
    func test_flush_sendsTheTokenReadBackAtSendTime() async {
        let service = MockPostService()
        let secret = "anon_guest_secret"
        let sut = VisitorReachReporter(
            postService: service, defaults: defaults, token: { secret },
            knownTokens: { [secret] }, flushDelay: 60,
            reconnects: Empty().eraseToAnyPublisher()
        )
        sut.record([.view(postId: "p1", durationMs: nil, surface: .visitor)])

        await sut.flushNow()

        XCTAssertEqual(service.recordedSocialEventsCredentials, [.visitor(secret)])
    }

    /// L'identité sous laquelle le contenu a été vu n'existe plus (clé
    /// visiteur effacée par la connexion d'un compte, invité parti) :
    /// l'événement est abandonné, jamais envoyé sous une autre identité.
    func test_flush_identityGone_dropsTheEventsWithoutSending() async {
        let service = MockPostService()
        let known = IdentityList(values: ["visitor_a"])
        let sut = VisitorReachReporter(
            postService: service, defaults: defaults, token: { "visitor_a" },
            knownTokens: { known.values }, flushDelay: 60,
            reconnects: Empty().eraseToAnyPublisher()
        )
        sut.record([.view(postId: "p1", durationMs: nil, surface: .visitor)])
        known.values = ["visitor_b"]

        await sut.flushNow()

        XCTAssertEqual(service.recordSocialEventsCallCount, 0)
        XCTAssertTrue(sut.pendingEvents.isEmpty)
        XCTAssertNil(defaults.data(forKey: VisitorReachReporter.storageKey))
    }

    /// Une file écrite par la version qui gardait le jeton en clair est
    /// effacée du disque au premier lancement.
    func test_legacyQueueWithRawToken_isErasedFromDisk() {
        let legacy = #"[{"event":{"type":"view","postId":"p1"},"token":"anon_legacy_secret"}]"#
        defaults.set(Data(legacy.utf8), forKey: VisitorReachReporter.storageKey)

        let sut = makeReporter(service: MockPostService())

        XCTAssertTrue(sut.pendingEvents.isEmpty)
        XCTAssertNil(defaults.data(forKey: VisitorReachReporter.storageKey))
    }

    private func waitUntil(timeout: TimeInterval = 3, _ condition: @escaping @MainActor () -> Bool) async -> Bool {
        let deadline = Date().addingTimeInterval(timeout)
        while Date() < deadline {
            if condition() { return true }
            try? await Task.sleep(nanoseconds: 20_000_000)
        }
        return condition()
    }
}

@MainActor
private final class IdentityBox {
    nonisolated deinit {}
    var value: String
    init(value: String) { self.value = value }
}

@MainActor
private final class IdentityList {
    nonisolated deinit {}
    var values: [String]
    init(values: [String]) { self.values = values }
}

@MainActor
final class MockVisitorReachReporter: VisitorReachReporting {
    nonisolated deinit {}

    private(set) var recorded: [SocialEvent] = []
    private(set) var flushCount = 0

    func record(_ events: [SocialEvent]) {
        recorded.append(contentsOf: events)
    }

    func flushNow() async {
        flushCount += 1
    }
}

/// #10500 — la file du lecteur sans compte garde l'enveloppe de chaque
/// événement : un rejeu renvoie les mêmes `eventId`, datés de l'occurrence.
extension VisitorContentReachTests {

    private func eventIds(_ service: MockPostService) -> [[String]] {
        service.recordedStampedSocialEventBatches.map { $0.map(\.stamp.eventId) }
    }

    func test_retryAfterAFailure_sendsTheSameEventIds() async {
        let service = MockPostService()
        service.recordSocialEventsResultsQueue = [.failure(URLError(.notConnectedToInternet))]
        let sut = makeReporter(service: service)
        sut.record([.view(postId: "p1", durationMs: nil, surface: .visitor)])

        await sut.flushNow()
        await sut.flushNow()

        let attempts = eventIds(service)
        XCTAssertEqual(attempts.count, 2)
        XCTAssertEqual(attempts[1], attempts[0])
    }

    func test_retryAcrossALaunch_sendsTheSameEventIds() async {
        let offline = MockPostService()
        offline.recordSocialEventsResult = .failure(URLError(.notConnectedToInternet))
        let first = makeReporter(service: offline)
        first.record([.view(postId: "p1", durationMs: 1_500, surface: .visitor)])
        await first.flushNow()

        let online = MockPostService()
        let revived = makeReporter(service: online)
        await revived.flushNow()

        XCTAssertEqual(eventIds(online), eventIds(offline))
    }

    func test_occurredAt_isTheRecordTime_notTheSendTime() async {
        let service = MockPostService()
        let clock = StampClock(now: Date(timeIntervalSince1970: 1_700_000_000))
        let sut = VisitorReachReporter(
            postService: service, defaults: defaults, token: { "visitor_test" },
            knownTokens: { ["visitor_test"] }, flushDelay: 60,
            reconnects: Empty().eraseToAnyPublisher(), clock: { clock.now }
        )
        sut.record([.view(postId: "p1", durationMs: nil, surface: .visitor)])
        clock.now = Date(timeIntervalSince1970: 1_700_000_600)

        await sut.flushNow()

        XCTAssertEqual(service.recordedStampedSocialEventBatches.first?.first?.stamp.occurredAt, Date(timeIntervalSince1970: 1_700_000_000))
    }

    /// Une file écrite avant #10500 (événements sans enveloppe) est relue sans
    /// perte puis réécrite : deux lancements successifs envoient le même
    /// `eventId`.
    func test_legacyQueueWithoutEnvelope_isReadAndRewritten() async throws {
        let identity = PendingVisitorEvent.identity(of: "visitor_test")
        let legacy = #"[{"event":{"type":"view","postId":"p1"},"identity":"\#(identity)"}]"#
        defaults.set(Data(legacy.utf8), forKey: VisitorReachReporter.storageKey)

        let firstLaunch = makeReporter(service: MockPostService())
        let secondLaunch = makeReporter(service: MockPostService())

        XCTAssertEqual(firstLaunch.pendingEvents.map(\.event), [.view(postId: "p1", durationMs: nil, surface: nil)])
        XCTAssertNil(firstLaunch.pendingEvents.first?.stamped.stamp.occurredAt)
        XCTAssertEqual(
            secondLaunch.pendingEvents.map(\.stamped.stamp.eventId),
            firstLaunch.pendingEvents.map(\.stamped.stamp.eventId),
            "L'identifiant donné à la relecture est réécrit sur le disque."
        )
        let rewritten = try XCTUnwrap(defaults.data(forKey: VisitorReachReporter.storageKey))
        XCTAssertTrue(String(decoding: rewritten, as: UTF8.self).contains("eventId"))
    }
}

@MainActor
private final class StampClock {
    nonisolated deinit {}
    var now: Date
    init(now: Date) { self.now = now }
}
