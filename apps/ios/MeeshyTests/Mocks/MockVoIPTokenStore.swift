import Foundation
@testable import MeeshySDK

/// In-memory ``VoIPTokenStoring`` for tests. The host app's keychain access
/// requires entitlements which are not granted to a pure xctest run, so
/// the production keychain-backed store is replaced with this stub.
///
/// Tracks call counts so tests can assert that the production code reads /
/// writes the store as expected (no silent fall-back to UserDefaults).
final class MockVoIPTokenStore: VoIPTokenStoring, @unchecked Sendable {

    private let lock = NSLock()
    private var storage: VoIPTokenRecord?
    private var legacy: VoIPTokenRecord?

    private(set) var readCallCount = 0
    private(set) var saveCallCount = 0
    private(set) var clearCallCount = 0
    private(set) var migrateCallCount = 0
    var saveErrorToThrow: Error?

    init(initial: VoIPTokenRecord? = nil, legacy: VoIPTokenRecord? = nil) {
        self.storage = initial
        self.legacy = legacy
    }

    func read() async -> VoIPTokenRecord? {
        lock.lock(); defer { lock.unlock() }
        readCallCount += 1
        return storage
    }

    func save(token: String, at date: Date) async throws {
        if let err = saveErrorToThrow { throw err }
        lock.lock(); defer { lock.unlock() }
        saveCallCount += 1
        storage = VoIPTokenRecord(token: token, at: date)
    }

    func clear() async {
        lock.lock(); defer { lock.unlock() }
        clearCallCount += 1
        storage = nil
    }

    @discardableResult
    func migrateFromUserDefaultsIfNeeded() async -> VoIPTokenRecord? {
        lock.lock()
        migrateCallCount += 1
        if let existing = storage {
            lock.unlock()
            return existing
        }
        if let legacy {
            storage = legacy
            self.legacy = nil
            lock.unlock()
            return legacy
        }
        lock.unlock()
        return nil
    }

    func snapshot() -> VoIPTokenRecord? {
        lock.lock(); defer { lock.unlock() }
        return storage
    }
}
