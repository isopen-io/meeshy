import XCTest
import Combine
@testable import Meeshy
import MeeshySDK

/// **Le plantage TestFlight des builds 1915/1916** — `SIGTRAP` dans
/// `_dispatch_assert_queue_fail` ← `swift_task_isCurrentExecutor` ←
/// `closure #1 in static VisitorReachReporter.liveReconnects.getter` ←
/// `Publishers.Filter.Inner.receive` ← `Publishers.Debounce.Inner.receive`,
/// sur une file de fond. Trois rapports, iOS 26.6.2 et 27.0.1 : « l'app est
/// inaccessible, ça s'arrête à chaque fois ».
///
/// `NetworkMonitor.isOfflinePublisher` débounce sur
/// `DispatchQueue.global(qos: .utility)` et LIVRE sur cette file. Le `filter`
/// de `liveReconnects`, écrit dans un type `@MainActor`, est isolé au
/// MainActor : le runtime vérifie l'exécuteur à son entrée et trappe. Le
/// rapporteur est construit au lancement (`VisitorReachReporter.shared`), donc
/// la première transition réseau — un lancement en 4G, un retour de Wi-Fi —
/// tuait l'app.
///
/// Ces témoins émettent depuis la file du vrai éditeur. Sans le saut sur le
/// main, ils ne rougissent pas : ils TUENT le process de test, exactement le
/// symptôme utilisateur. La garde de source attrape le même défaut proprement.
@MainActor
final class VisitorReachReconnectsTests: XCTestCase {

    private var cancellables = Set<AnyCancellable>()
    private var defaults: UserDefaults!
    private var suiteName: String!

    override func setUp() async throws {
        try await super.setUp()
        suiteName = "visitor-reach-reconnects-\(UUID().uuidString)"
        defaults = UserDefaults(suiteName: suiteName)
    }

    override func tearDown() async throws {
        cancellables.removeAll()
        defaults.removePersistentDomain(forName: suiteName)
        defaults = nil
        try await super.tearDown()
    }

    func test_aReconnectFromTheUtilityQueue_isDeliveredOnTheMainThread_withoutTrapping() async {
        let offline = PassthroughSubject<Bool, Never>()
        let delivered = expectation(description: "retour du réseau livré")
        var deliveredOnMain = false

        VisitorReachReporter.reconnects(from: offline.eraseToAnyPublisher())
            .sink { _ in
                deliveredOnMain = Thread.isMainThread
                delivered.fulfill()
            }
            .store(in: &cancellables)

        nonisolated(unsafe) let source = offline
        DispatchQueue.global(qos: .utility).async { source.send(false) }

        await fulfillment(of: [delivered], timeout: 2)
        XCTAssertTrue(deliveredOnMain, "le retour du réseau doit arriver sur le main")
    }

    func test_goingOffline_isNotAReconnect() async {
        let offline = PassthroughSubject<Bool, Never>()
        var count = 0
        let settled = expectation(description: "le retour qui suit la coupure arrive")

        VisitorReachReporter.reconnects(from: offline.eraseToAnyPublisher())
            .sink { _ in
                count += 1
                settled.fulfill()
            }
            .store(in: &cancellables)

        nonisolated(unsafe) let source = offline
        DispatchQueue.global(qos: .utility).async {
            source.send(true)
            source.send(false)
        }

        await fulfillment(of: [settled], timeout: 2)
        XCTAssertEqual(count, 1, "seule la transition vers EN LIGNE est un retour du réseau")
    }

    /// Le rapporteur entier : un retour du réseau livré d'une file de fond vide
    /// la file en attente, sur le MainActor, sans trapper.
    func test_reporter_flushesOnAReconnectFromABackgroundQueue() async {
        let service = MockPostService()
        let reconnects = PassthroughSubject<Void, Never>()
        let sut = VisitorReachReporter(
            postService: service,
            defaults: defaults,
            token: { "jeton" },
            knownTokens: { ["jeton"] },
            flushDelay: 3_600,
            reconnects: reconnects.eraseToAnyPublisher()
        )
        sut.record([.view(postId: "p1", durationMs: nil, surface: .visitor, entry: .direct)])

        nonisolated(unsafe) let source = reconnects
        DispatchQueue.global(qos: .utility).async { source.send(()) }

        let deadline = Date().addingTimeInterval(2)
        while service.recordSocialEventsCallCount == 0, Date() < deadline {
            try? await Task.sleep(nanoseconds: 20_000_000)
        }
        XCTAssertEqual(service.recordSocialEventsCallCount, 1, "le retour du réseau doit vider la file")
        XCTAssertTrue(sut.pendingEvents.isEmpty)
    }

    /// Un opérateur à fermeture qui ne s'exécute que sur une file de fond ne
    /// rougit pas : il crashe. La garde fige l'invariant à la source — dans
    /// `reconnects(from:)` et dans l'abonnement de l'initialiseur, le saut sur
    /// le main PRÉCÈDE le premier opérateur à fermeture.
    func test_source_hopsToTheMainQueueBeforeEveryClosureOperator() throws {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()   // Services/
            .deletingLastPathComponent()   // Unit/
            .deletingLastPathComponent()   // MeeshyTests/
            .deletingLastPathComponent()   // ios/
            .appendingPathComponent("Meeshy/Features/Main/Services/VisitorReachReporter.swift")
        let source = AppSourceGuard.stripComments(try String(contentsOf: url, encoding: .utf8))
        XCTAssertFalse(source.isEmpty)

        let reconnectsBody = try XCTUnwrap(
            source.range(of: "static func reconnects(from").map { String(source[$0.lowerBound...].prefix(400)) },
            "reconnects(from:) a disparu de VisitorReachReporter"
        )
        let hop = try XCTUnwrap(reconnectsBody.range(of: ".receive(on: DispatchQueue.main)"),
                                "isOfflinePublisher livre d'une file de fond : saut sur le main obligatoire")
        let filter = try XCTUnwrap(reconnectsBody.range(of: ".filter"))
        XCTAssertLessThan(hop.lowerBound, filter.lowerBound, "le saut sur le main doit PRÉCÉDER le filter")

        XCTAssertFalse(
            source.contains("isOfflinePublisher\n            .filter"),
            "isOfflinePublisher ne s'enchaîne jamais directement sur une fermeture isolée"
        )

        let initSink = try XCTUnwrap(
            source.range(of: "reconnects\n            .receive(on: DispatchQueue.main)\n            .sink"),
            "l'abonnement de l'initialiseur doit sauter sur le main avant son sink"
        )
        XCTAssertNotNil(initSink)
    }
}
