import Foundation
@testable import Meeshy

final class MockComposerAutosaveStore: ComposerAutosaveProviding, @unchecked Sendable {
    var loadResult: ComposerAutosaveRestored?
    var hasDraftResult = false
    private(set) var saveCallCount = 0
    private(set) var lastSaved: ComposerAutosaveWrite?
    private(set) var loadCallCount = 0
    private(set) var deleteCallCount = 0
    private(set) var deleteAllCallCount = 0
    private(set) var waitCallCount = 0

    func save(_ write: ComposerAutosaveWrite, account: ComposerAutosaveAccount, slot: ComposerAutosaveSlot) {
        saveCallCount += 1
        lastSaved = write
    }

    func hasDraft(account: ComposerAutosaveAccount, slot: ComposerAutosaveSlot) -> Bool {
        hasDraftResult
    }

    func load(account: ComposerAutosaveAccount, slot: ComposerAutosaveSlot) -> ComposerAutosaveRestored? {
        loadCallCount += 1
        return loadResult
    }

    func delete(account: ComposerAutosaveAccount, slot: ComposerAutosaveSlot) {
        deleteCallCount += 1
    }

    func deleteAll() {
        deleteAllCallCount += 1
    }

    func waitForPendingWrites() {
        waitCallCount += 1
    }

    func reset() {
        loadResult = nil
        hasDraftResult = false
        saveCallCount = 0
        lastSaved = nil
        loadCallCount = 0
        deleteCallCount = 0
        deleteAllCallCount = 0
        waitCallCount = 0
    }
}
