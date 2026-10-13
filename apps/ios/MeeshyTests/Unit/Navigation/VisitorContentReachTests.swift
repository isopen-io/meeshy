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
        let sut = VisitorContentReach(reporter: reporter)

        sut.stateChanged(.pending)
        sut.stateChanged(served("p1"))

        XCTAssertEqual(reporter.recorded, [
            .impression(postId: "p1", source: "detail", surface: .visitor),
            .view(postId: "p1", durationMs: nil, surface: .visitor),
        ])
    }

    func test_load_refusedOrFailed_sendsNothing() {
        let reporter = MockVisitorReachReporter()
        let sut = VisitorContentReach(reporter: reporter)

        sut.stateChanged(.refused)
        sut.stateChanged(.failed)

        XCTAssertTrue(reporter.recorded.isEmpty)
    }

    func test_load_sameContentServedTwice_countsOnce() {
        let reporter = MockVisitorReachReporter()
        let sut = VisitorContentReach(reporter: reporter)

        sut.stateChanged(served("p1"))
        sut.stateChanged(.pending)
        sut.stateChanged(served("p1"))

        XCTAssertEqual(reporter.recorded.count, 2)
    }

    func test_disappear_sendsViewWithDuration() async {
        let reporter = MockVisitorReachReporter()
        var now = Date(timeIntervalSince1970: 1_000)
        let sut = VisitorContentReach(reporter: reporter, clock: { now })
        sut.stateChanged(served("p1"))

        now = now.addingTimeInterval(4.2)
        await sut.left()

        XCTAssertEqual(reporter.recorded.last, .view(postId: "p1", durationMs: 4_200, surface: .visitor))
        XCTAssertEqual(reporter.flushCount, 1)
    }

    func test_disappear_withoutServedContent_sendsNothing() async {
        let reporter = MockVisitorReachReporter()
        let sut = VisitorContentReach(reporter: reporter)

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
            flushDelay: 60,
            reconnects: reconnects
        )
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
            postService: service, defaults: defaults, token: { identity.value }, flushDelay: 60,
            reconnects: Empty().eraseToAnyPublisher()
        )
        sut.record([.view(postId: "p1", durationMs: nil, surface: .visitor)])
        identity.value = "anon_guest"
        sut.record([.view(postId: "p2", durationMs: nil, surface: .visitor)])

        await sut.flushNow()

        XCTAssertEqual(service.recordedSocialEventsCredentials, [.visitor("visitor_a"), .visitor("anon_guest")])
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
