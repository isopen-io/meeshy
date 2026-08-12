//
//  TestHelpers.swift
//  MeeshyTests
//
//  Common test utilities and helpers
//

import XCTest
import Combine
@testable import Meeshy

// MARK: - Async Test Helpers

// `@nonobjc` on the non-generic helpers below is load-bearing, not cosmetic.
// Swift 6.2.1's SILGen crashes (`emitNativeToForeignThunk` → segfault) when it
// tries to synthesise an Objective-C bridging thunk for an `async`/closure
// method declared in an extension of the `@objc` `XCTestCase` class. These
// helpers are only ever called from Swift, so suppressing the (buggy) ObjC
// thunk emission is both correct and the documented workaround. The generic
// helpers in the other extensions are not `@objc`-representable, so they don't
// need it.
extension XCTestCase {
    /// Wait for async expectation with timeout
    @nonobjc
    func waitForExpectation(timeout: TimeInterval = 5.0, handler: XCWaitCompletionHandler? = nil) {
        wait(for: [], timeout: timeout)
    }

    /// Wait for condition to be true
    @nonobjc
    func waitForCondition(
        timeout: TimeInterval = 5.0,
        pollingInterval: TimeInterval = 0.1,
        condition: @escaping () -> Bool
    ) async throws {
        let deadline = Date().addingTimeInterval(timeout)

        while Date() < deadline {
            if condition() {
                return
            }
            try await Task.sleep(nanoseconds: UInt64(pollingInterval * 1_000_000_000))
        }

        XCTFail("Condition not met within timeout")
    }

    /// Waits for a `@Published`-backed value to satisfy `condition`, driven by
    /// Combine emissions + an `XCTestExpectation` — NOT a wall-clock sleep.
    ///
    /// Use this after triggering a fire-and-forget `Task` whose completion
    /// isn't otherwise awaitable (e.g. an outbox outcome-stream observer):
    /// asserting on the mutated `@Published` property right after a fixed
    /// `Task.sleep` is flaky under CI contention (#1869) — the observer Task
    /// may not have run yet. Subscribing reacts the instant the mutation
    /// actually happens instead of hoping a fixed delay was long enough.
    ///
    /// `@MainActor`-pinned (this target's `SWIFT_DEFAULT_ACTOR_ISOLATION` is
    /// `nonisolated`, see project.yml): the `@Published` view models this is
    /// used with are themselves `@MainActor`, so subscribing here — same
    /// actor as the caller — avoids any cross-actor hop/Sendable requirement
    /// on the Combine publisher or the closure. No `@nonobjc` needed: unlike
    /// the non-generic helpers above, a generic method isn't `@objc`-representable.
    @MainActor
    func waitForPublishedValue<P: Publisher>(
        _ publisher: P,
        timeout: TimeInterval = 2.0,
        condition: @escaping (P.Output) -> Bool
    ) async where P.Failure == Never {
        let expectation = XCTestExpectation(description: "Published value met condition")
        // `@Published` replays its CURRENT value synchronously to a new
        // subscriber, i.e. possibly before `cancellable` below has been
        // assigned. Guarding with `fulfilled` keeps `fulfill()` to exactly
        // one call regardless of that race (XCTestExpectation asserts on
        // over-fulfillment by default).
        var fulfilled = false
        var cancellable: AnyCancellable?
        cancellable = publisher.sink { value in
            guard !fulfilled, condition(value) else { return }
            fulfilled = true
            expectation.fulfill()
            cancellable?.cancel()
        }
        await fulfillment(of: [expectation], timeout: timeout)
        cancellable?.cancel()
    }
}

// MARK: - Main Actor Test Helpers

extension XCTestCase {
    /// Execute test on main actor
    @nonobjc
    @MainActor
    func runOnMainActor(_ block: @MainActor () async throws -> Void) async throws {
        try await block()
    }
}

// MARK: - Data Comparison Helpers

extension XCTestCase {
    /// Assert arrays are equal ignoring order
    func assertArraysEqualIgnoringOrder<T: Hashable>(_ lhs: [T], _ rhs: [T], file: StaticString = #filePath, line: UInt = #line) {
        XCTAssertEqual(Set(lhs), Set(rhs), "Arrays contain different elements", file: file, line: line)
    }

    /// Assert dates are approximately equal (within threshold)
    func assertDatesEqual(_ date1: Date, _ date2: Date, threshold: TimeInterval = 1.0, file: StaticString = #filePath, line: UInt = #line) {
        let difference = abs(date1.timeIntervalSince(date2))
        XCTAssertLessThan(difference, threshold, "Dates differ by more than \(threshold) seconds", file: file, line: line)
    }
}

// MARK: - Error Testing Helpers

extension XCTestCase {
    /// Assert async function throws specific error
    func assertThrowsError<T, E: Error & Equatable>(
        _ expression: @autoclosure () async throws -> T,
        expectedError: E,
        file: StaticString = #filePath,
        line: UInt = #line
    ) async {
        do {
            _ = try await expression()
            XCTFail("Expected error to be thrown", file: file, line: line)
        } catch let error as E {
            XCTAssertEqual(error, expectedError, file: file, line: line)
        } catch {
            XCTFail("Wrong error type thrown: \(error)", file: file, line: line)
        }
    }

    /// Assert async function throws any error
    func assertThrowsAnyError<T>(
        _ expression: @autoclosure () async throws -> T,
        file: StaticString = #filePath,
        line: UInt = #line
    ) async {
        do {
            _ = try await expression()
            XCTFail("Expected error to be thrown", file: file, line: line)
        } catch {
            // Success - error was thrown
        }
    }

    /// Assert async function does not throw
    func assertNoThrow<T>(
        _ expression: @autoclosure () async throws -> T,
        file: StaticString = #filePath,
        line: UInt = #line
    ) async {
        do {
            _ = try await expression()
        } catch {
            XCTFail("Unexpected error thrown: \(error)", file: file, line: line)
        }
    }
}

// MARK: - Performance Helpers

extension XCTestCase {
    /// Measure async operation performance.
    ///
    /// `Task { }` defaults to the current actor; when used inside XCTest's
    /// synchronous `measure {}` block on `@MainActor` test classes, the
    /// scheduled task can deadlock against `wait(for:timeout:)` because both
    /// want the main runloop. `Task.detached` escapes the actor, runs on a
    /// background thread, and signals the expectation cleanly.
    @nonobjc
    func measureAsync(
        timeout: TimeInterval = 60.0,
        options: XCTMeasureOptions = XCTMeasureOptions.default,
        block: @Sendable @escaping () async throws -> Void
    ) {
        measure(options: options) {
            let expectation = XCTestExpectation(description: "Async operation")
            Task.detached {
                try? await block()
                expectation.fulfill()
            }
            wait(for: [expectation], timeout: timeout)
        }
    }
}

// MARK: - Memory Leak Detection

// MemoryLeakTracker: use XCTestCase.addTeardownBlock directly in test methods instead of this class.

// MARK: - Test Data Cleanup

class TestDataCleaner {
    static func cleanupTestData() {
        // Clear UserDefaults
        if let bundleID = Bundle.main.bundleIdentifier {
            UserDefaults.standard.removePersistentDomain(forName: bundleID)
        }
        // Note: Keychain and cache cleanup should be performed via their respective service instances in tearDown
    }
}

// MARK: - Network Simulation

class NetworkSimulator {
    enum NetworkCondition {
        case normal
        case slow
        case veryWeak
        case offline

        var delay: TimeInterval {
            switch self {
            case .normal: return 0.1
            case .slow: return 1.0
            case .veryWeak: return 3.0
            case .offline: return 0.0
            }
        }
    }

    static func simulateNetworkCondition(_ condition: NetworkCondition) async {
        if condition == .offline {
            return
        }
        try? await Task.sleep(nanoseconds: UInt64(condition.delay * 1_000_000_000))
    }
}

// MARK: - JSON Helpers

extension XCTestCase {
    /// Load JSON from test bundle
    func loadJSON<T: Decodable>(filename: String) throws -> T {
        guard let url = Bundle(for: type(of: self)).url(forResource: filename, withExtension: "json") else {
            throw NSError(domain: "TestError", code: 1, userInfo: [NSLocalizedDescriptionKey: "JSON file not found"])
        }

        let data = try Data(contentsOf: url)
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        return try decoder.decode(T.self, from: data)
    }

    /// Convert object to JSON string
    func toJSONString<T: Encodable>(_ object: T) throws -> String {
        let encoder = JSONEncoder()
        encoder.outputFormatting = .prettyPrinted
        let data = try encoder.encode(object)
        return String(data: data, encoding: .utf8) ?? ""
    }
}

// MARK: - Concurrency Helpers

actor TestActor {
    var value: Int = 0

    func increment() {
        value += 1
    }

    func getValue() -> Int {
        return value
    }
}

// MARK: - Custom Assertions

extension XCTestCase {
    /// Assert collection is not empty
    func assertNotEmpty<T: Collection>(_ collection: T, _ message: String = "Collection should not be empty", file: StaticString = #filePath, line: UInt = #line) {
        XCTAssertFalse(collection.isEmpty, message, file: file, line: line)
    }

    /// Assert collection is empty
    func assertEmpty<T: Collection>(_ collection: T, _ message: String = "Collection should be empty", file: StaticString = #filePath, line: UInt = #line) {
        XCTAssertTrue(collection.isEmpty, message, file: file, line: line)
    }

    /// Assert optional is nil
    func assertNil<T>(_ optional: T?, _ message: String = "Value should be nil", file: StaticString = #filePath, line: UInt = #line) {
        XCTAssertNil(optional, message, file: file, line: line)
    }

    /// Assert optional is not nil and return unwrapped value
    @discardableResult
    func assertNotNil<T>(_ optional: T?, _ message: String = "Value should not be nil", file: StaticString = #filePath, line: UInt = #line) -> T? {
        XCTAssertNotNil(optional, message, file: file, line: line)
        return optional
    }
}

// MARK: - Performance Environment (device + iOS awareness)

/// Décrit l'appareil et l'OS sur lesquels tournent les benchmarks. Les chiffres
/// de perf ne sont comparables QU'À environnement égal : un iPhone 16 Pro Max
/// (A18 Pro) est ~3-5× plus rapide qu'un iPhone XR (A12). XCTest stocke déjà ses
/// baselines par destination ; ce helper rend l'environnement EXPLICITE dans la
/// sortie pour interpréter/comparer correctement, et signale le simulateur (dont
/// les timings ne sont PAS représentatifs — exécuter sur device réel).
enum PerfEnvironment {
    static var isSimulator: Bool {
        #if targetEnvironment(simulator)
        return true
        #else
        return false
        #endif
    }

    /// Identifiant matériel : "iPhone17,2" (16 Pro Max), "iPhone11,8" (XR)… Sur
    /// simulateur, le modèle simulé via `SIMULATOR_MODEL_IDENTIFIER`.
    static var machineIdentifier: String {
        #if targetEnvironment(simulator)
        return ProcessInfo.processInfo.environment["SIMULATOR_MODEL_IDENTIFIER"] ?? "Simulator"
        #else
        var systemInfo = utsname()
        uname(&systemInfo)
        let mirror = Mirror(reflecting: systemInfo.machine)
        return mirror.children.reduce(into: "") { id, element in
            guard let value = element.value as? Int8, value != 0 else { return }
            id.append(Character(UnicodeScalar(UInt8(value))))
        }
        #endif
    }

    static var osVersion: String {
        let v = ProcessInfo.processInfo.operatingSystemVersion
        return "\(v.majorVersion).\(v.minorVersion).\(v.patchVersion)"
    }

    /// Cœurs + RAM — proxys grossiers de la puissance pour pondérer
    /// l'interprétation des chiffres entre devices.
    static var coreCount: Int { ProcessInfo.processInfo.processorCount }
    static var physicalMemoryGB: Double {
        Double(ProcessInfo.processInfo.physicalMemory) / 1_073_741_824.0
    }

    static var summary: String {
        let env = isSimulator ? "SIMULATOR" : "DEVICE"
        return String(
            format: "[%@] model=%@ iOS=%@ cores=%d ram=%.1fGB",
            env, machineIdentifier, osVersion, coreCount, physicalMemoryGB
        )
    }

    /// Logge l'environnement et avertit BRUYAMMENT si on tourne sur simulateur
    /// (timings non représentatifs — les benchmarks doivent tourner sur device).
    static func logAndWarn() {
        print("[PERF] env: \(summary)")
        if isSimulator {
            print("[PERF] ⚠️ SIMULATEUR : timings NON représentatifs (CPU/GPU = la machine hôte). Lancer sur device réel — `./scripts/ios-perf-benchmark.sh` détecte et cible le device connecté.")
        }
    }
}

// MARK: - Memory Probe (RSS réel du process)

/// Lit la mémoire résidente (RSS) du process via `mach_task_basic_info`. Permet
/// de mesurer un DELTA mémoire ISOLÉ dans le MÊME test (ex : RSS après données
/// vs RSS après rendu) — au lieu de soustraire deux pics `XCTMemoryMetric` de
/// tests différents (non comparable). Approximation : le RSS inclut le slack de
/// l'allocateur, donc à interpréter comme un ordre de grandeur, pas au Mo près.
enum MemoryProbe {
    static func residentBytes() -> UInt64 {
        var info = mach_task_basic_info()
        var count = mach_msg_type_number_t(
            MemoryLayout<mach_task_basic_info>.stride / MemoryLayout<natural_t>.stride
        )
        let kr = withUnsafeMutablePointer(to: &info) { ptr -> kern_return_t in
            ptr.withMemoryRebound(to: integer_t.self, capacity: Int(count)) { intPtr in
                task_info(mach_task_self_, task_flavor_t(MACH_TASK_BASIC_INFO), intPtr, &count)
            }
        }
        return kr == KERN_SUCCESS ? info.resident_size : 0
    }

    static func residentMB() -> Double { Double(residentBytes()) / 1_048_576.0 }
}
