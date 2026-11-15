import XCTest
import Combine
@testable import MeeshySDK

final class NetworkMonitorTests: XCTestCase {

    private var cancellables = Set<AnyCancellable>()

    override func tearDown() {
        cancellables.removeAll()
        super.tearDown()
    }

    // MARK: - Singleton

    func test_shared_returnsSameInstance() {
        let a = NetworkMonitor.shared
        let b = NetworkMonitor.shared
        XCTAssertTrue(a === b)
    }

    // MARK: - Initial State

    func test_connectionType_initialValue_isValid() {
        let monitor = NetworkMonitor.shared
        let validTypes: [NetworkMonitor.ConnectionType] = [.wifi, .cellular, .wired, .unknown]
        XCTAssertTrue(validTypes.contains(monitor.connectionType))
    }

    func test_isOffline_initialValue_isBool() {
        let monitor = NetworkMonitor.shared
        // isOffline is a Bool — just verify it can be read without crashing
        _ = monitor.isOffline
    }

    // MARK: - ConnectionType

    func test_connectionType_wifi_rawValue() {
        XCTAssertEqual(NetworkMonitor.ConnectionType.wifi.rawValue, "wifi")
    }

    func test_connectionType_cellular_rawValue() {
        XCTAssertEqual(NetworkMonitor.ConnectionType.cellular.rawValue, "cellular")
    }

    func test_connectionType_wired_rawValue() {
        XCTAssertEqual(NetworkMonitor.ConnectionType.wired.rawValue, "wired")
    }

    func test_connectionType_unknown_rawValue() {
        XCTAssertEqual(NetworkMonitor.ConnectionType.unknown.rawValue, "unknown")
    }

    // MARK: - ObservableObject

    func test_shared_conformsToObservableObject() {
        let monitor: any ObservableObject = NetworkMonitor.shared
        XCTAssertNotNil(monitor)
    }

    // MARK: - isOfflinePublisher (debounced, deduplicated)

    func test_isOfflinePublisher_emits_on_state_change_after_debounce() {
        let monitor = NetworkMonitor.makeForTesting()
        let exp = expectation(description: "got true after debounce")
        let lock = NSLock()
        var fulfilled = false
        monitor.isOfflinePublisher
            .filter { $0 }
            .sink { value in
                lock.lock(); defer { lock.unlock() }
                guard !fulfilled else { return }
                fulfilled = true
                XCTAssertTrue(value)
                exp.fulfill()
            }
            .store(in: &cancellables)
        monitor.simulateOffline()
        wait(for: [exp], timeout: 10)
    }

    func test_isOfflinePublisher_dedupes_repeated_same_value() {
        let monitor = NetworkMonitor.makeForTesting()
        let lock = NSLock()
        var trueEmissions = 0
        let exp = expectation(description: "got first true after debounce")
        monitor.isOfflinePublisher
            .filter { $0 }
            .sink { _ in
                lock.lock(); defer { lock.unlock() }
                trueEmissions += 1
                if trueEmissions == 1 { exp.fulfill() }
            }
            .store(in: &cancellables)
        monitor.simulateOffline()
        monitor.simulateOffline()
        wait(for: [exp], timeout: 10)
        let settle = expectation(description: "settle")
        DispatchQueue.main.asyncAfter(deadline: .now() + 1.0) { settle.fulfill() }
        wait(for: [settle], timeout: 5)
        lock.lock(); defer { lock.unlock() }
        XCTAssertEqual(trueEmissions, 1, "removeDuplicates must coalesce repeated true values into a single emission")
    }

    // MARK: - Un chemin inchangé ne republie rien (#17250)

    private final class Count: @unchecked Sendable {
        private let lock = NSLock()
        private var value = 0
        func bump() { lock.lock(); value += 1; lock.unlock() }
        var current: Int { lock.lock(); defer { lock.unlock() }; return value }
    }

    /// Relevé sur appareil, application en arrière-plan : `Network: online via wifi` toutes les ~2 s. Le système
    /// rappelle `pathUpdateHandler` pour des changements qui ne touchent pas la photo (ou seulement sa qualité) ; chaque
    /// rappel republiait `isOffline` / `connectionType` à l'identique, réveillant tous les observateurs.
    func test_anUnchangedReading_republishesNothing() async {
        let source = NetworkPathSource.makeForTesting()
        source.publish(NetworkPathSnapshot(isSatisfied: true, usesWiFi: true))
        let monitor = NetworkMonitor.makeForTesting(source: source)
        let changes = Count()
        monitor.objectWillChange.sink { changes.bump() }.store(in: &cancellables)

        source.publish(NetworkPathSnapshot(isSatisfied: true, usesWiFi: true))
        source.publish(NetworkPathSnapshot(isSatisfied: true, isExpensive: true, usesWiFi: true))
        try? await Task.sleep(nanoseconds: 300_000_000)

        XCTAssertEqual(changes.current, 0, "la lecture binaire n'a pas changé : rien ne doit être republié")

        source.publish(NetworkPathSnapshot(isSatisfied: false))
        try? await Task.sleep(nanoseconds: 300_000_000)

        XCTAssertGreaterThan(changes.current, 0)
        XCTAssertTrue(monitor.isOffline)
    }

    func test_theSource_neverRepublishesAnIdenticalSnapshot() {
        let source = NetworkPathSource.makeForTesting()
        let received = Count()
        source.publisher.sink { _ in received.bump() }.store(in: &cancellables)

        source.publish(NetworkPathSnapshot(isSatisfied: true))
        source.publish(NetworkPathSnapshot(isSatisfied: true, usesWiFi: true))
        source.publish(NetworkPathSnapshot(isSatisfied: true, usesWiFi: true))

        XCTAssertEqual(received.current, 2, "la valeur courante, puis le seul changement")
    }
}
