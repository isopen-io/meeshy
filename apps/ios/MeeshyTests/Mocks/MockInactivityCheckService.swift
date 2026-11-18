import Foundation
import MeeshySDK
@testable import Meeshy

/// `InactivityCheckServiceProviding` en mémoire : chaque route rend ce qu'on lui a dit et compte ses appels.
final class MockInactivityCheckService: InactivityCheckServiceProviding, @unchecked Sendable {
    private let lock = NSLock()

    var snapshotResult: Result<[InactivityAlertState], Error> = .success([])
    var settingsResult: Result<InactivityCheckSettings, Error> = .success(InactivityCheckSettings(delay: .twelveHours))
    var updateSettingsResult: Result<InactivityCheckSettings, Error>?
    var personSettingsResult: Result<InactivityPersonSettings, Error> = .success(
        InactivityPersonSettings(userId: "peer", isShared: true)
    )
    var updatePersonSettingsResult: Result<InactivityPersonSettings, Error>?
    var answerWellnessResult: WellnessAnswerOutcome = .tracked

    private(set) var answerWellnessCallCount = 0
    private(set) var updateSettingsCalls: [InactivityCheckDelay] = []
    private(set) var updatePersonSettingsCalls: [Bool] = []

    func snapshot() async throws -> [InactivityAlertState] { try snapshotResult.get() }

    func settings() async throws -> InactivityCheckSettings { try settingsResult.get() }

    func updateSettings(delay: InactivityCheckDelay) async throws -> InactivityCheckSettings {
        lock.withLock { updateSettingsCalls.append(delay) }
        if let updateSettingsResult { return try updateSettingsResult.get() }
        return InactivityCheckSettings(delay: delay)
    }

    func personSettings(userId: String) async throws -> InactivityPersonSettings { try personSettingsResult.get() }

    func updatePersonSettings(userId: String, isShared: Bool) async throws -> InactivityPersonSettings {
        lock.withLock { updatePersonSettingsCalls.append(isShared) }
        if let updatePersonSettingsResult { return try updatePersonSettingsResult.get() }
        return InactivityPersonSettings(userId: userId, isShared: isShared)
    }

    /// Vrai : la réponse attend `releaseAnswers()` — pour éprouver deux réponses arrivées ensemble.
    var holdsAnswer = false
    private var released = false
    private var waiters: [CheckedContinuation<Void, Never>] = []

    func releaseAnswers() {
        let pending = lock.withLock { () -> [CheckedContinuation<Void, Never>] in
            released = true
            defer { waiters = [] }
            return waiters
        }
        pending.forEach { $0.resume() }
    }

    func answerWellness() async -> WellnessAnswerOutcome {
        lock.withLock { answerWellnessCallCount += 1 }
        if holdsAnswer {
            await withCheckedContinuation { (continuation: CheckedContinuation<Void, Never>) in
                let resumeNow = lock.withLock { () -> Bool in
                    if released { return true }
                    waiters.append(continuation)
                    return false
                }
                if resumeNow { continuation.resume() }
            }
        }
        return answerWellnessResult
    }
}

/// La persistance du store de l'alerte d'inactivité, en mémoire.
final class MemoryInactivityAlertStatePersistence: InactivityAlertStatePersisting, @unchecked Sendable {
    private let lock = NSLock()
    private var stored: [InactivityAlertState] = []

    func load() -> [InactivityAlertState] { lock.withLock { stored } }
    func save(_ states: [InactivityAlertState]) { lock.withLock { stored = states } }
}
