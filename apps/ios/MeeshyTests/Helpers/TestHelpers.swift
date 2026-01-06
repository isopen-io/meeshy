//
//  TestHelpers.swift
//  MeeshyTests
//
//  Common test utilities and helpers
//

import XCTest
@testable import Meeshy

// MARK: - Async Test Helpers

extension XCTestCase {
    /// Wait for async expectation with timeout
    func waitForExpectation(timeout: TimeInterval = 5.0, handler: XCWaitCompletionHandler? = nil) {
        wait(for: [], timeout: timeout)
    }

    /// Wait for condition to be true
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
}

// MARK: - Main Actor Test Helpers

extension XCTestCase {
    /// Execute test on main actor
    @MainActor
    func runOnMainActor(_ block: @MainActor () async throws -> Void) async throws {
        try await block()
    }
}

// MARK: - Data Comparison Helpers

extension XCTestCase {
    /// Assert arrays are equal ignoring order
    func assertArraysEqualIgnoringOrder<T: Equatable>(_ lhs: [T], _ rhs: [T], file: StaticString = #file, line: UInt = #line) {
        XCTAssertEqual(Set(lhs), Set(rhs), "Arrays contain different elements", file: file, line: line)
    }

    /// Assert dates are approximately equal (within threshold)
    func assertDatesEqual(_ date1: Date, _ date2: Date, threshold: TimeInterval = 1.0, file: StaticString = #file, line: UInt = #line) {
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
        file: StaticString = #file,
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
        file: StaticString = #file,
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
        file: StaticString = #file,
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
    /// Measure async operation performance
    func measureAsync(
        options: XCTMeasureOptions = XCTMeasureOptions.default,
        block: @escaping () async throws -> Void
    ) {
        measure(options: options) {
            let expectation = XCTestExpectation(description: "Async operation")
            Task {
                try? await block()
                expectation.fulfill()
            }
            wait(for: [expectation], timeout: 10.0)
        }
    }
}

// MARK: - Memory Leak Detection

class MemoryLeakTracker {
    static func trackForMemoryLeaks(_ instance: AnyObject, file: StaticString = #file, line: UInt = #line) {
        addTeardownBlock { [weak instance] in
            XCTAssertNil(instance, "Instance should have been deallocated. Potential memory leak.", file: file, line: line)
        }
    }
}

// MARK: - Test Data Cleanup

class TestDataCleaner {
    static func cleanupTestData() {
        // Clear UserDefaults
        if let bundleID = Bundle.main.bundleIdentifier {
            UserDefaults.standard.removePersistentDomain(forName: bundleID)
        }

        // Clear Keychain (test data only)
        // Implementation depends on KeychainService

        // Clear cache
        CacheService.shared.clearAll()
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
    func assertNotEmpty<T: Collection>(_ collection: T, _ message: String = "Collection should not be empty", file: StaticString = #file, line: UInt = #line) {
        XCTAssertFalse(collection.isEmpty, message, file: file, line: line)
    }

    /// Assert collection is empty
    func assertEmpty<T: Collection>(_ collection: T, _ message: String = "Collection should be empty", file: StaticString = #file, line: UInt = #line) {
        XCTAssertTrue(collection.isEmpty, message, file: file, line: line)
    }

    /// Assert optional is nil
    func assertNil<T>(_ optional: T?, _ message: String = "Value should be nil", file: StaticString = #file, line: UInt = #line) {
        XCTAssertNil(optional, message, file: file, line: line)
    }

    /// Assert optional is not nil and return unwrapped value
    @discardableResult
    func assertNotNil<T>(_ optional: T?, _ message: String = "Value should not be nil", file: StaticString = #file, line: UInt = #line) -> T? {
        XCTAssertNotNil(optional, message, file: file, line: line)
        return optional
    }
}
