import Foundation
import MeeshySDK
@testable import Meeshy

/// `PhoneCallServiceProviding` en mémoire : chaque route rend ce qu'on lui a dit et compte ses appels.
final class MockPhoneCallService: PhoneCallServiceProviding, @unchecked Sendable {
    private let lock = NSLock()

    var reportResult: PhoneCallReportOutcome = .tracked
    var snapshotResult: Result<[PhoneCallState], Error> = .success([])
    var emitterSettingsResult: Result<PhoneCallEmitterSettings, Error> = .success(PhoneCallEmitterSettings(sharingEnabled: true))
    var updateEmitterSettingsResult: Result<PhoneCallEmitterSettings, Error>?
    var personSettingsResult: Result<PhoneCallPersonSettings, Error> = .success(
        PhoneCallPersonSettings(userId: "peer", isShared: true)
    )
    var updatePersonSettingsResult: Result<PhoneCallPersonSettings, Error>?

    private var reports: [Bool] = []
    private var emitterUpdates: [Bool] = []
    private var personUpdates: [Bool] = []

    var reportCalls: [Bool] { lock.withLock { reports } }
    var updateEmitterSettingsCalls: [Bool] { lock.withLock { emitterUpdates } }
    var updatePersonSettingsCalls: [Bool] { lock.withLock { personUpdates } }

    func report(active: Bool) async -> PhoneCallReportOutcome {
        lock.withLock {
            reports.append(active)
            return reportResult
        }
    }

    func snapshot() async throws -> [PhoneCallState] { try snapshotResult.get() }

    func emitterSettings() async throws -> PhoneCallEmitterSettings { try emitterSettingsResult.get() }

    func updateEmitterSettings(sharingEnabled: Bool) async throws -> PhoneCallEmitterSettings {
        lock.withLock { emitterUpdates.append(sharingEnabled) }
        if let updateEmitterSettingsResult { return try updateEmitterSettingsResult.get() }
        return PhoneCallEmitterSettings(sharingEnabled: sharingEnabled)
    }

    func personSettings(userId: String) async throws -> PhoneCallPersonSettings { try personSettingsResult.get() }

    func updatePersonSettings(userId: String, isShared: Bool) async throws -> PhoneCallPersonSettings {
        lock.withLock { personUpdates.append(isShared) }
        if let updatePersonSettingsResult { return try updatePersonSettingsResult.get() }
        return PhoneCallPersonSettings(userId: userId, isShared: isShared)
    }
}

/// La persistance du store d'« en appel », en mémoire.
final class MemoryPhoneCallStatePersistence: PhoneCallStatePersisting, @unchecked Sendable {
    private let lock = NSLock()
    private var stored: [PhoneCallState] = []

    func load() -> [PhoneCallState] { lock.withLock { stored } }
    func save(_ states: [PhoneCallState]) { lock.withLock { stored = states } }
}
