import Foundation
import MeeshySDK
@testable import Meeshy

/// `PhoneReachabilityServiceProviding` en mémoire : chaque route rend ce qu'on lui a dit et compte ses appels.
final class MockPhoneReachabilityService: PhoneReachabilityServiceProviding, @unchecked Sendable {
    private let lock = NSLock()

    var snapshotResult: Result<[PhoneReachabilityState], Error> = .success([])
    var stateResult: Result<PhoneReachabilityState?, Error> = .success(nil)
    var personSettingsResult: Result<PhoneReachabilityPersonSettings, Error> = .success(
        PhoneReachabilityPersonSettings(userId: "peer", isShared: false)
    )
    var updatePersonSettingsResult: Result<PhoneReachabilityPersonSettings, Error>?
    var updateAlertResult: Result<PhoneReachabilityPersonSettings, Error>?
    var emitterSettingsResult: Result<PhoneReachabilityEmitterSettings, Error> = .success(
        PhoneReachabilityEmitterSettings(sharingEnabled: true)
    )
    var updateEmitterSettingsResult: Result<PhoneReachabilityEmitterSettings, Error>?
    var aliveResult: PhoneAliveOutcome = .tracked

    private(set) var aliveCallCount = 0
    private(set) var updatePersonSettingsCalls: [Bool] = []
    private(set) var updateAlertCalls: [Bool] = []
    private(set) var updateEmitterSettingsCalls: [Bool] = []

    func snapshot() async throws -> [PhoneReachabilityState] { try snapshotResult.get() }

    func state(userId: String) async throws -> PhoneReachabilityState? { try stateResult.get() }

    func personSettings(userId: String) async throws -> PhoneReachabilityPersonSettings { try personSettingsResult.get() }

    func updatePersonSettings(userId: String, isShared: Bool) async throws -> PhoneReachabilityPersonSettings {
        lock.withLock { updatePersonSettingsCalls.append(isShared) }
        if let updatePersonSettingsResult { return try updatePersonSettingsResult.get() }
        return PhoneReachabilityPersonSettings(userId: userId, isShared: isShared)
    }

    func updateAlert(userId: String, alertsMe: Bool) async throws -> PhoneReachabilityPersonSettings {
        lock.withLock { updateAlertCalls.append(alertsMe) }
        if let updateAlertResult { return try updateAlertResult.get() }
        return PhoneReachabilityPersonSettings(userId: userId, isShared: false, alertsMe: alertsMe)
    }

    func emitterSettings() async throws -> PhoneReachabilityEmitterSettings { try emitterSettingsResult.get() }

    func updateEmitterSettings(sharingEnabled: Bool) async throws -> PhoneReachabilityEmitterSettings {
        lock.withLock { updateEmitterSettingsCalls.append(sharingEnabled) }
        if let updateEmitterSettingsResult { return try updateEmitterSettingsResult.get() }
        return PhoneReachabilityEmitterSettings(sharingEnabled: sharingEnabled)
    }

    func alive() async -> PhoneAliveOutcome {
        lock.withLock { aliveCallCount += 1 }
        return aliveResult
    }
}

/// La persistance du store du téléphone injoignable, en mémoire.
final class MemoryPhoneReachabilityStatePersistence: PhoneReachabilityStatePersisting, @unchecked Sendable {
    private let lock = NSLock()
    private var stored: [PhoneReachabilityState] = []

    func load() -> [PhoneReachabilityState] { lock.withLock { stored } }
    func save(_ states: [PhoneReachabilityState]) { lock.withLock { stored = states } }
}

/// La mémoire de l'offre « Prévenir {name} », en mémoire.
@MainActor
final class MemoryPhoneReachabilityConsent: PhoneReachabilityConsentRemembering {
    private(set) var offered: Set<String> = []

    nonisolated deinit {}

    func wasOffered(viewerId: String, peerId: String) -> Bool { offered.contains("\(viewerId)|\(peerId)") }
    func markOffered(viewerId: String, peerId: String) { offered.insert("\(viewerId)|\(peerId)") }
}
