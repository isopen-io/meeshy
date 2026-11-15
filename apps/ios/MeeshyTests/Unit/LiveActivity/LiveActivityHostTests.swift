import XCTest
@testable import Meeshy

/// **Les activités en direct ne parlent jamais à ActivityKit sur le fil
/// principal** (#11524, suite de #11516).
///
/// Le premier accès à ActivityKit ouvre sa connexion par un XPC synchrone, et
/// les suivants restent des allers-retours synchrones avec le démon : un
/// échantillon a montré le fil principal tenu 30 s. L'hôte garde donc le
/// handle qu'il obtient et n'interroge le système que hors du fil principal,
/// sans perdre l'ordre ouverture → mises à jour → fermeture.
@MainActor
final class LiveActivityHostTests: XCTestCase {

    // MARK: - Hors du fil principal

    func test_start_update_endOrphans_neverTouchTheBackendOnTheMainThread() async {
        let (host, backend) = makeSUT()

        host.endOrphans()
        host.start(1)
        host.update(2)
        await host.waitForPendingWork()

        XCTAssertEqual(backend.calls, ["openActivities", "areEnabled", "request:1", "update:2"])
        XCTAssertEqual(backend.mainThreadCalls, [], "ActivityKit appelé sur le fil principal")
    }

    // MARK: - L'ordre des appels

    func test_slowOpening_keepsStartUpdateEndInOrder_andNeverOpensTwice() async {
        let gate = DispatchSemaphore(value: 0)
        let (host, backend) = makeSUT(requestGate: gate)

        host.start(1)
        host.start(2)
        host.update(3)
        XCTAssertTrue(host.isRunning, "une ouverture en cours compte comme une activité qui tourne")
        host.end(4, dismissAfter: 0)
        gate.signal()
        await host.waitForPendingWork()

        XCTAssertEqual(backend.calls, ["areEnabled", "request:1", "end:a1:4"])
        XCTAssertFalse(host.isRunning)
    }

    func test_endDuringOpening_closesTheHandleObtained() async {
        let gate = DispatchSemaphore(value: 0)
        let (host, backend) = makeSUT(requestGate: gate)

        host.start(1)
        host.end(9, dismissAfter: 0)
        gate.signal()
        await host.waitForPendingWork()

        XCTAssertEqual(backend.calls, ["areEnabled", "request:1", "end:a1:9"])
        XCTAssertNil(host.activityID)
    }

    func test_updatesAfterOpening_reachTheOpenedHandle() async {
        let (host, backend) = makeSUT()

        host.start(1)
        host.update(2)
        host.start(3)
        await host.waitForPendingWork()

        XCTAssertEqual(backend.calls, ["areEnabled", "request:1", "update:2", "update:3"])
    }

    // MARK: - Fermée par l'utilisateur ou le système

    func test_dismissedBySystem_returnsToIdle_andTheNextStartReopens() async throws {
        let (host, backend) = makeSUT()
        host.start(1)
        await host.waitForPendingWork()
        XCTAssertTrue(host.isRunning)

        backend.handles.first?.closeFromOutside()
        try await waitUntil { !host.isRunning }
        host.start(2)
        await host.waitForPendingWork()

        XCTAssertEqual(backend.calls, ["areEnabled", "request:1", "areEnabled", "request:2"])
        XCTAssertEqual(host.activityID, "a2")
    }

    // MARK: - L'ouverture se signale

    func test_onStarted_receivesTheOpenedActivityID() async {
        let (host, _) = makeSUT()
        var started: [String] = []
        host.onStarted = { started.append($0) }

        host.start(1)
        XCTAssertNil(host.activityID, "l'id n'existe qu'une fois l'activité ouverte")
        await host.waitForPendingWork()

        XCTAssertEqual(started, ["a1"])
        XCTAssertEqual(host.activityID, "a1")
    }

    func test_disabledActivities_openNothing_andStayIdle() async {
        let (host, backend) = makeSUT(enabled: false)

        host.start(1)
        await host.waitForPendingWork()

        XCTAssertEqual(backend.calls, ["areEnabled"])
        XCTAssertFalse(host.isRunning)
    }

    func test_endOrphans_sparesTheActivityOpenedJustBefore() async {
        let (host, backend) = makeSUT(orphanIDs: ["old"])

        host.start(1)
        host.endOrphans()
        await host.waitForPendingWork()

        XCTAssertEqual(backend.keptByOrphanSweep, ["a1"])
        XCTAssertEqual(backend.calls, ["areEnabled", "request:1", "openActivities", "end:old:nil"])
    }

    // MARK: - Une seule frontière ActivityKit

    func test_onlyTheBackendNamesActivityKitAPIs() throws {
        let appRoot = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent().deletingLastPathComponent()
            .deletingLastPathComponent().deletingLastPathComponent()
            .appendingPathComponent("Meeshy")
        let backendName = "LiveActivityBackend.swift"
        let patterns = [#"(?<![A-Za-z])Activity<"#, #"(?<![A-Za-z])Activity\.request"#, "ActivityAuthorizationInfo", #"\.activities\b"#]
        let regexes = try patterns.map { try NSRegularExpression(pattern: $0) }
        func matches(_ source: String) -> [String] {
            zip(patterns, regexes).compactMap { pattern, regex in
                regex.firstMatch(in: source, range: NSRange(source.startIndex..., in: source)) == nil ? nil : pattern
            }
        }

        let files = try XCTUnwrap(FileManager.default.enumerator(at: appRoot, includingPropertiesForKeys: nil))
            .compactMap { $0 as? URL }
            .filter { $0.pathExtension == "swift" }
        XCTAssertTrue(files.contains { $0.lastPathComponent == "LiveActivityHost.swift" }, "le balayage ne voit pas l'hôte")

        var backendSeen = false
        for file in files {
            let source = try String(contentsOf: file, encoding: .utf8)
            if file.lastPathComponent == backendName {
                backendSeen = true
                XCTAssertEqual(matches(source).count, patterns.count, "la frontière doit porter l'API d'ActivityKit")
                continue
            }
            guard source.contains("ActivityKit") || source.contains("LiveActivity") else { continue }
            XCTAssertEqual(matches(source), [], "\(file.lastPathComponent) nomme ActivityKit hors de \(backendName)")
        }
        XCTAssertTrue(backendSeen)
    }

    // MARK: - Fabrique

    private func makeSUT(
        enabled: Bool = true,
        requestGate: DispatchSemaphore? = nil,
        orphanIDs: [String] = []
    ) -> (LiveActivityHost<String, Int>, FakeLiveActivityBackend) {
        let backend = FakeLiveActivityBackend(enabled: enabled, requestGate: requestGate, orphanIDs: orphanIDs)
        return (LiveActivityHost(backend: backend, attributes: { "attributes" }), backend)
    }

    private func waitUntil(_ condition: () -> Bool) async throws {
        for _ in 0..<400 where !condition() {
            try await Task.sleep(nanoseconds: 5_000_000)
        }
        XCTAssertTrue(condition(), "condition jamais atteinte")
    }
}

// MARK: - Faux backend

nonisolated final class FakeLiveActivityBackend: LiveActivityBackend, @unchecked Sendable {
    typealias Attributes = String
    typealias State = Int

    private let lock = NSLock()
    private let enabled: Bool
    private let requestGate: DispatchSemaphore?
    private let orphanIDs: [String]
    private var recorded: [(call: String, onMain: Bool)] = []
    private var opened: [FakeLiveActivityHandle] = []
    private var kept: [String?] = []

    init(enabled: Bool, requestGate: DispatchSemaphore?, orphanIDs: [String]) {
        self.enabled = enabled
        self.requestGate = requestGate
        self.orphanIDs = orphanIDs
    }

    var calls: [String] { lock.withLock { recorded.map(\.call) } }
    var mainThreadCalls: [String] { lock.withLock { recorded.filter(\.onMain).map(\.call) } }
    var handles: [FakeLiveActivityHandle] { lock.withLock { opened } }
    var keptByOrphanSweep: [String?] { lock.withLock { kept } }

    func record(_ call: String) {
        let onMain = Thread.isMainThread
        lock.withLock { recorded.append((call, onMain)) }
    }

    func areEnabled() -> Bool {
        record("areEnabled")
        return enabled
    }

    func request(_ attributes: String, state: Int) throws -> any LiveActivityHandle<Int> {
        record("request:\(state)")
        requestGate?.wait()
        return lock.withLock {
            let handle = FakeLiveActivityHandle(id: "a\(opened.count + 1)", backend: self)
            opened.append(handle)
            return handle
        }
    }

    func openActivities(except keep: String?) -> [any LiveActivityHandle<Int>] {
        record("openActivities")
        lock.withLock { kept.append(keep) }
        return orphanIDs.filter { $0 != keep }.map { FakeLiveActivityHandle(id: $0, backend: self) }
    }
}

nonisolated final class FakeLiveActivityHandle: LiveActivityHandle, @unchecked Sendable {
    let id: String
    private let backend: FakeLiveActivityBackend
    private let closures: AsyncStream<Void>
    private let continuation: AsyncStream<Void>.Continuation

    init(id: String, backend: FakeLiveActivityBackend) {
        self.id = id
        self.backend = backend
        (closures, continuation) = AsyncStream<Void>.makeStream()
    }

    func closeFromOutside() {
        continuation.yield()
    }

    @concurrent func update(_ state: Int) async {
        backend.record("update:\(state)")
    }

    @concurrent func end(_ state: Int?, dismissAfter delay: TimeInterval) async {
        backend.record("end:\(id):\(state.map(String.init) ?? "nil")")
    }

    @concurrent func waitUntilClosed() async {
        for await _ in closures { return }
    }
}
